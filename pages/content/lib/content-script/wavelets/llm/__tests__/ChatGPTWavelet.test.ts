// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { ChatGPTWavelet } from '../ChatGPTWavelet';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const config: SelectorConfig = {
  family: 'llm',
  provider: 'chatgpt',
  version: 'test',
  hostname_patterns: ['chatgpt.com'],
  selectors: {
    role_attribute: ['data-absent-role', 'data-custom-role'],
    message_id_attribute: ['data-absent-id', 'data-custom-id'],
    message_container: ['.fixture-message'],
    content: ['.fixture-text'],
  },
  is_active: true,
};

class FixtureWavelet extends ChatGPTWavelet {
  process(node: HTMLElement): void {
    this.processAddedNode(node);
  }
}

describe('ChatGPT message attribute overrides', () => {
  it('uses configured attributes when scheduling both direct and nested messages', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <article class="fixture-message" data-custom-role="user" data-custom-id="prompt">
        <span class="fixture-text">Question</span><span>Ignore me</span>
      </article>
      <section><article class="fixture-message" data-custom-role="assistant" data-custom-id="reply">
        <span class="fixture-text">Answer</span><span>Ignore me</span>
      </article></section>`;
    const wavelet = new FixtureWavelet(config);
    wavelet.process(document.body.children[0] as HTMLElement);
    wavelet.process(document.body.children[1] as HTMLElement);
    await vi.advanceTimersByTimeAsync(1500);

    expect(vi.mocked(runtime.sendMessage).mock.calls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        type: 'LLM_MESSAGE',
        data: expect.objectContaining({
          message_type: 'user_question',
          message_id: 'prompt',
          message_content: 'Question',
          turn_index: 1,
        }),
      }),
      expect.objectContaining({
        type: 'LLM_MESSAGE',
        data: expect.objectContaining({
          message_type: 'ai_response',
          message_id: 'reply',
          message_content: 'Answer',
          turn_index: 2,
        }),
      }),
    ]);
  });

  it('keeps the built-in attributes as fallback when configured names are absent', () => {
    const node = document.createElement('article');
    node.className = 'fixture-message';
    node.setAttribute('data-message-author-role', 'user');
    node.setAttribute('data-message-id', 'legacy');
    node.textContent = 'Legacy message';
    document.body.append(node);

    expect(new ChatGPTWavelet(config).extractMessage(node)).toMatchObject({
      message_type: 'user_question',
      message_id: 'legacy',
      message_content: 'Legacy message',
    });
  });
});
