/**
 * @fileoverview Extracts structured data from DeepSeek conversations by monitoring the DOM for message elements.
 * Detects both user questions and AI responses, capturing content, metadata, and session info.
 * Uses a debounced approach to handle dynamic content updates during message generation.
 * Excludes chain-of-thought (.ds-think-content) from captured assistant content.
 * Extracted messages are sent to the background script for further processing and storage.
 */
import { LLMData, SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { BaseLLMWavelet } from './BaseLLMWavelet';

export class DeepSeekWavelet extends BaseLLMWavelet {
  constructor(config?: SelectorConfig) {
    super(config);
  }

  /**
   * Determines if the current page belongs to the DeepSeek chat site.
   * @returns True if the page is a DeepSeek conversation, false otherwise.
   */
  isSite(): boolean {
    if (this.selectorConfig?.hostname_patterns?.length) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    return window.location.hostname.includes('chat.deepseek.com');
  }

  /**
   * Extracts structured LLMData from a DeepSeek message element.
   * Assistant messages are identified by having a direct-child .ds-markdown element.
   * Chain-of-thought content (.ds-think-content) is excluded from the captured text.
   * @param element The DOM element representing a chat message (.ds-message wrapper).
   * @returns The extracted LLMData or null if extraction fails.
   */
  extractMessage(element: HTMLElement): LLMData | null {
    try {
      // A direct-child .ds-markdown indicates an assistant message;
      // user messages do not have this element as a direct child.
      const assistantMarkerSel = this.sel(element, 'assistant_marker', ':scope > .ds-markdown');
      const directMarkdown = element.querySelector(assistantMarkerSel);
      const isAssistant = !!directMarkdown;

      let messageContent: string;
      if (isAssistant) {
        // Clone to strip think-content before reading text
        const clone = (directMarkdown as HTMLElement).cloneNode(true) as HTMLElement;
        const excludeSel = this.sel(directMarkdown as HTMLElement, 'content_exclude', '.ds-think-content');
        clone.querySelectorAll(excludeSel).forEach(el => el.remove());
        messageContent = clone.textContent?.trim() || '';
      } else {
        messageContent = element.textContent?.trim() || '';
      }

      if (!messageContent) return null;

      // Stable ID from the virtual-list wrapper
      const stableIdClosest =
        this.selectorConfig?.selectors['stable_id_closest']?.[0] ?? '[data-virtual-list-item-key]';
      const stableIdAttr = this.selectorConfig?.selectors['stable_id_attribute']?.[0] ?? 'data-virtual-list-item-key';
      const listItem = element.closest<HTMLElement>(stableIdClosest);
      const itemKey = listItem?.getAttribute(stableIdAttr) || '';

      const chatSessionId =
        window.location.pathname.split('/').pop() || `chat-${window.location.pathname.replace(/[^a-zA-Z0-9]/g, '-')}`;

      const messageId = itemKey
        ? `${chatSessionId}-${itemKey}`
        : `generated-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      const containerSel = this.selectorConfig?.selectors['message_container']?.[0] ?? '.ds-message';
      const allMessages = Array.from(document.querySelectorAll<HTMLElement>(containerSel));
      const turnIndex = allMessages.indexOf(element) + 1;

      return {
        llm_provider: 'deepseek',
        message_type: isAssistant ? 'ai_response' : 'user_question',
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
      console.error('🤖[DeepSeek] Error extracting message:', error);
      return null;
    }
  }

  /**
   * Watches a DeepSeek assistant element for streaming updates and schedules captures.
   * Uses the same debounce approach as ChatGPT since DeepSeek has no streaming attribute.
   * @param element The assistant container element to watch for updates.
   */
  watchElement(element: HTMLElement): void {
    let hasStarted = false;

    const streamObserver = new MutationObserver(() => {
      hasStarted = true;
      this.scheduleCapture(element);
    });

    streamObserver.observe(element, { childList: true, subtree: true, characterData: true });

    const disconnectTimer = setInterval(() => {
      if (hasStarted && !this.pendingCaptures.has(element)) {
        streamObserver.disconnect();
        clearInterval(disconnectTimer);
      }
    }, 2000);
  }

  /**
   * Processes a newly added DOM node.
   * Detects .ds-message elements inside the node and routes to
   * scheduleCapture (user) or watchElement (assistant).
   * @param element The newly added DOM element to process.
   */
  protected processAddedNode(element: HTMLElement): void {
    const containerSel = this.sel(element, 'message_container', '.ds-message');
    const assistantMarkerSel = this.sel(element, 'assistant_marker', ':scope > .ds-markdown');

    const found: HTMLElement[] = [];
    if (element.matches?.(containerSel)) found.push(element);
    element.querySelectorAll<HTMLElement>(containerSel).forEach(el => found.push(el));

    // When .ds-markdown is inserted inside an existing .ds-message (after thinking finishes),
    // the added node itself is not a .ds-message — walk up to find the parent container.
    if (!found.length) {
      const parentMessage = element.closest<HTMLElement>(containerSel);
      if (parentMessage) found.push(parentMessage);
    }

    found.forEach(el => {
      const isAssistant = !!el.querySelector(assistantMarkerSel);
      if (!isAssistant) {
        this.scheduleCapture(el);
      } else {
        const hasContent = !!el.querySelector(assistantMarkerSel)?.textContent?.trim();
        if (hasContent) {
          this.scheduleCapture(el);
        } else {
          this.watchElement(el);
        }
      }
    });
  }
}
