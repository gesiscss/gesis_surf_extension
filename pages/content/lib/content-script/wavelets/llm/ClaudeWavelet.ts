/**
 * @fileoverview Implements the ClaudeWavelet class for extracting user and assistant messages from the Claude AI interface.
 * The wavelet detects message elements in the DOM, extracts structured data, and sends it to the background script.
 * It handles both user questions and AI responses, using a debounced approach for user messages and attribute watching for assistant messages.
 * The extracted data includes content, metadata, session info, and is deduplicated before sending.
 */
import { LLMData } from "@chrome-extension-boilerplate/shared/lib/types/contentScript";
import { BaseLLMWavelet } from './BaseLLMWavelet';

export class ClaudeWavelet extends BaseLLMWavelet {

    /**
     * Determines if the current page belongs to the Claude AI site by checking the hostname.
     * @returns True if the page is a Claude conversation, false otherwise.
     */
    isSite(): boolean {
        return window.location.hostname.includes('claude.ai');
    }

    /**
     * Extracts structured LLMData from a Claude message element.
     * @param element The DOM element representing a chat message.
     * @returns The extracted LLMData or null if extraction fails.
     */
    extractMessage(element: HTMLElement): LLMData | null {
        try {
            const isUser = element.getAttribute('data-testid') === 'user-message';
            const isAssistant = element.hasAttribute('data-is-streaming');

            if (!isUser && !isAssistant) return null;

            const messageContent = isUser
                ? element.querySelector('.whitespace-pre-wrap')?.textContent?.trim() || element.textContent?.trim() || ''
                : Array.from(element.querySelectorAll('.font-claude-response-body'))
                    .map(el => el.textContent?.trim() ?? '')
                    .filter(Boolean)
                    .join('\n\n');

            if (!messageContent) return null;

            // Claude has no stable data-message-id — generate from content hash
            const messageId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const chatSessionId = window.location.pathname.split('/').pop() ||
                `chat-${window.location.pathname.replace(/[^a-zA-Z0-9]/g, '-')}`;
            
            const allMessages = Array.from(
                document.querySelectorAll<HTMLElement>('[data-testid="user-message"], [data-is-streaming]')
            );
            const turnIndex = allMessages.indexOf(element) + 1;

            return {    
                llm_provider: 'claude',
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
            console.error('🤖[Claude] Error extracting message:', error);
            return null;
        }
    }

    /**
     * Watches a Claude assistant element for updates and schedules captures.
     * @param element The assistant container element to watch for updates.
     */
    watchElement(element: HTMLElement): void {
        // Claude exposes data-is-streaming attribute — no debounce needed
        if (element.getAttribute('data-is-streaming') === 'false') {
        // already complete when inserted
        this.captureAssistant(element);
        return;
        }

        const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'data-is-streaming' &&
            (mutation.target as HTMLElement).getAttribute('data-is-streaming') === 'false'
            ) {
            observer.disconnect();
            this.captureAssistant(mutation.target as HTMLElement);
            return;
            }
        }
        });

        observer.observe(element, { attributes: true, attributeFilter: ['data-is-streaming'] });
    }

    /**
     * Captures an assistant message by extracting data and sending it if not already sent.
     * @param element The DOM element representing the assistant message to capture.
     * @returns void
     */
    private captureAssistant(element: HTMLElement): void {
        const data = this.extractMessage(element);
        if (!data) return;
        if (this.sentMessageIds.has(data.message_id)) return;
        this.sentMessageIds.add(data.message_id);
        this.sendData(data);
    }

    /**
     * Processes a newly added DOM node.
     * @param element The newly added DOM element to process. Detects user messages and assistant containers, routing to scheduleCapture or watchElement.
     */
    protected processAddedNode(element: HTMLElement): void {
        // User messages
        const userMsgs: HTMLElement[] = element.getAttribute('data-testid') === 'user-message'
        ? [element]
        : Array.from(element.querySelectorAll<HTMLElement>('[data-testid="user-message"]'));

        userMsgs.forEach(el => this.scheduleCapture(el, 500));

        // Assistant streaming containers
        const assistantEls: HTMLElement[] = element.hasAttribute('data-is-streaming')
        ? [element]
        : Array.from(element.querySelectorAll<HTMLElement>('[data-is-streaming]'));

        assistantEls.forEach(el => this.watchElement(el));
    }
}