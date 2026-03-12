/**
 * @fileoverview Extracts structured data from Google Gemini conversations by monitoring the DOM for message elements.
 * Detects user questions (`user-query` custom elements) and AI responses (`model-response` custom elements).
 * Uses `aria-busy` attribute on the markdown container to detect streaming completion.
 * Extracted messages are sent to the background script for further processing and storage.
 */
import { LLMData } from "@chrome-extension-boilerplate/shared/lib/types/contentScript";
import { BaseLLMWavelet } from './BaseLLMWavelet';

export class GeminiWavelet extends BaseLLMWavelet {

    /**
     * Determines if the current page belongs to the Google Gemini site.
     * @returns True if the page is a Gemini conversation, false otherwise.
     */
    isSite(): boolean {
        return window.location.hostname.includes('gemini.google.com');
    }

    /**
     * Extracts structured LLMData from a Gemini message element.
     * User messages use `p.query-text-line` for text content.
     * Assistant messages use `.markdown.markdown-main-panel` for text content.
     * Stable turn IDs are derived from the parent `.conversation-container` id attribute.
     * @param element The DOM element representing a chat message (`user-query` or `model-response`).
     * @returns The extracted LLMData or null if extraction fails.
     */
    extractMessage(element: HTMLElement): LLMData | null {
        try {
            const tag = element.tagName.toLowerCase();
            const isUser = tag === 'user-query';
            const isAssistant = tag === 'model-response';

            if (!isUser && !isAssistant) return null;

            const messageContent = isUser
                ? Array.from(element.querySelectorAll('p.query-text-line'))
                    .map(p => p.textContent?.trim() ?? '')
                    .filter(Boolean)
                    .join('\n')
                : element.querySelector('.markdown.markdown-main-panel')?.textContent?.trim() || '';

            if (!messageContent) return null;

            // Derive stable message ID from the parent conversation-container's id attribute
            const container = element.closest('.conversation-container');
            const containerId = container?.id || '';
            const messageId = containerId
                ? `${containerId}-${isUser ? 'user' : 'model'}`
                : `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const chatSessionId = window.location.pathname.split('/').pop() ||
                `chat-${window.location.pathname.replace(/[^a-zA-Z0-9]/g, '-')}`;

            // Compute turn_index from all conversation containers in DOM order
            const allContainers = Array.from(document.querySelectorAll('.conversation-container'));
            const parentContainer = element.closest('.conversation-container');
            const containerIndex = parentContainer ? allContainers.indexOf(parentContainer) : -1;
            // Each container holds one user-query + one model-response → 2 turns per container
            const turnIndex = containerIndex >= 0
                ? containerIndex * 2 + (isUser ? 1 : 2)
                : 0;

            return {
                llm_provider: 'gemini',
                message_type: isUser ? 'user_question' : 'ai_response',
                message_content: messageContent.substring(0, 5000),
                message_id: messageId,
                timestamp: new Date().toISOString(),
                chat_session_id: chatSessionId,
                url: window.location.href,
                page_title: document.title,
                domain_id: '',
                turn_index: turnIndex,
            };
        } catch (error) {
            console.error('🤖[Gemini] Error extracting message:', error);
            return null;
        }
    }

    /**
     * Watches a Gemini assistant (`model-response`) element for streaming completion.
     * Gemini uses `aria-busy="true"` on the `.markdown` container while streaming.
     * When `aria-busy` flips to `"false"` (or is removed), the response is complete.
     * @param element The `model-response` element to watch for updates.
     */
    watchElement(element: HTMLElement): void {
        const markdownEl = element.querySelector('.markdown.markdown-main-panel');

        // If no markdown container yet, fall back to subtree watching
        if (!markdownEl) {
            const subtreeObserver = new MutationObserver(() => {
                const md = element.querySelector('.markdown.markdown-main-panel');
                if (md) {
                    subtreeObserver.disconnect();
                    this.watchMarkdownStreaming(element, md as HTMLElement);
                }
            });
            subtreeObserver.observe(element, { childList: true, subtree: true });
            return;
        }

        this.watchMarkdownStreaming(element, markdownEl as HTMLElement);
    }

    /**
     * Watches the `.markdown` element's `aria-busy` attribute for streaming completion.
     * If already not busy, captures immediately. Otherwise waits for the attribute change.
     * @param responseEl The `model-response` element to extract from once streaming completes.
     * @param markdownEl The `.markdown.markdown-main-panel` element whose `aria-busy` attribute signals streaming state.
     */
    private watchMarkdownStreaming(responseEl: HTMLElement, markdownEl: HTMLElement): void {
        const isBusy = markdownEl.getAttribute('aria-busy') === 'true';

        if (!isBusy) {
            // Already complete
            this.scheduleCapture(responseEl, 500);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'aria-busy' &&
                    (mutation.target as HTMLElement).getAttribute('aria-busy') !== 'true'
                ) {
                    observer.disconnect();
                    this.scheduleCapture(responseEl, 1000);
                    return;
                }
            }
        });

        observer.observe(markdownEl, { attributes: true, attributeFilter: ['aria-busy'] });
    }

    /**
     * Processes a newly added DOM node.
     * Detects `user-query` elements (routed to scheduleCapture) and
     * `model-response` elements (routed to watchElement or scheduleCapture if content is present).
     * @param element The newly added DOM element to process.
     */
    protected processAddedNode(element: HTMLElement): void {
        // Collect user-query elements
        const userEls: HTMLElement[] = [];
        if (element.tagName?.toLowerCase() === 'user-query') userEls.push(element);
        element.querySelectorAll<HTMLElement>('user-query').forEach(el => userEls.push(el));

        userEls.forEach(el => this.scheduleCapture(el, 500));

        // Collect model-response elements
        const assistantEls: HTMLElement[] = [];
        if (element.tagName?.toLowerCase() === 'model-response') assistantEls.push(element);
        element.querySelectorAll<HTMLElement>('model-response').forEach(el => assistantEls.push(el));

        assistantEls.forEach(el => {
            const markdownEl = el.querySelector('.markdown.markdown-main-panel');
            const hasContent = !!(markdownEl?.textContent?.trim());
            const isBusy = markdownEl?.getAttribute('aria-busy') === 'true';

            if (hasContent && !isBusy) {
                // Already complete — capture directly
                this.scheduleCapture(el, 500);
            } else {
                // Still streaming or no content yet — watch for completion
                this.watchElement(el);
            }
        });
    }
}
