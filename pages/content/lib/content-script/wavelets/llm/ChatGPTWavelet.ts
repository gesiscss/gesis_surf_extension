/**
 * @fileoverview Extracts structured data from ChatGPT conversations by monitoring the DOM for message elements.
 * Detects both user questions and AI responses, capturing content, metadata, and session info.
 * Uses a debounced approach to handle dynamic content updates during message generation.
 * Extracted messages are sent to the background script for further processing and storage.
 */
import { LLMData, SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { BaseLLMWavelet } from './BaseLLMWavelet';

export class ChatGPTWavelet extends BaseLLMWavelet {
  constructor(config?: SelectorConfig) {
    super(config);
  }

  /**
   * Determines if the current page belongs to the ChatGPT site.
   * @returns True if the page is a ChatGPT conversation, false otherwise.
   */
  isSite(): boolean {
    if (this.selectorConfig) {
      return this.selectorConfig.hostname_patterns.some(p => window.location.hostname.includes(p));
    }
    const hostname = window.location.hostname;
    return hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com');
  }

  private readMessageAttribute(
    element: HTMLElement,
    key: 'role_attribute' | 'message_id_attribute',
    fallback: string,
  ): string | null {
    for (const name of this.selectorConfig?.selectors[key] ?? []) {
      const value = element.getAttribute(name);
      if (value) return value;
    }
    return element.getAttribute(fallback);
  }

  /**
   * Extracts structured LLMData from a ChatGPT message element.
   * @param element The DOM element representing a chat message.
   * @returns The extracted LLMData or null if extraction fails.
   */
  extractMessage(element: HTMLElement): LLMData | null {
    try {
      const role = this.readMessageAttribute(element, 'role_attribute', 'data-message-author-role');
      if (role !== 'user' && role !== 'assistant') return null;

      const contentSel = this.sel(element, 'content', '.whitespace-pre-wrap');
      const messageContent =
        element.querySelector(contentSel)?.textContent?.trim() || element.textContent?.trim() || '';
      if (!messageContent) return null;

      const messageId =
        this.readMessageAttribute(element, 'message_id_attribute', 'data-message-id') ||
        this.generateMessageId('generated');

      const chatSessionId =
        window.location.pathname.split('/').pop() || `chat-${window.location.pathname.replace(/[^a-zA-Z0-9]/g, '-')}`;

      const containerSel = this.sel(document.body, 'message_container', '[data-message-author-role]');
      const allMessages = Array.from(document.querySelectorAll<HTMLElement>(containerSel));
      const turnIndex = allMessages.indexOf(element) + 1;

      return {
        llm_provider: 'chatgpt',
        message_type: role === 'user' ? 'user_question' : 'ai_response',
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
      console.error('🤖[ChatGPT] Error extracting message:', error);
      return null;
    }
  }

  /**
   * Watches a ChatGPT assistant element for updates and schedules captures.
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
   * Should detect message elements inside the node and route to
   * scheduleCapture (user) or watchElement (assistant).
   * @param element The newly added DOM element to process.
   */
  protected processAddedNode(element: HTMLElement): void {
    const containerSel = this.sel(document.body, 'message_container', '[data-message-author-role]');
    const contentSel = this.sel(element, 'content', '.whitespace-pre-wrap');

    const found = [element, ...Array.from(element.querySelectorAll<HTMLElement>(containerSel))];

    found.forEach(el => {
      const role = this.readMessageAttribute(el, 'role_attribute', 'data-message-author-role');
      if (role === 'user') {
        this.scheduleCapture(el);
      } else if (role === 'assistant') {
        const hasContent = !!(el.querySelector(contentSel)?.textContent?.trim() || el.textContent?.trim());
        if (hasContent) {
          this.scheduleCapture(el);
        } else {
          this.watchElement(el);
        }
      }
    });
  }
}
