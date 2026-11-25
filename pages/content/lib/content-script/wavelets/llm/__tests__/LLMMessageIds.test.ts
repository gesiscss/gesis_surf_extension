// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { ChatGPTWavelet } from '../ChatGPTWavelet';
import { ClaudeWavelet } from '../ClaudeWavelet';
import { DeepSeekWavelet } from '../DeepSeekWavelet';
import { GeminiWavelet } from '../GeminiWavelet';

vi.mock('webextension-polyfill', () => ({ runtime: { sendMessage: vi.fn() } }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

const uuidSuffix = /-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ChatGPTFixture extends ChatGPTWavelet {
  process(element: HTMLElement): void {
    this.processAddedNode(element);
  }
}

class ClaudeFixture extends ClaudeWavelet {
  process(element: HTMLElement): void {
    this.processAddedNode(element);
  }
}

describe.each([
  ['chatgpt', () => new ChatGPTWavelet(), '<article data-message-author-role="user">Hello</article>', 'article'],
  ['claude', () => new ClaudeWavelet(), '<article data-testid="user-message">Hello</article>', 'article'],
  ['deepseek', () => new DeepSeekWavelet(), '<article class="ds-message">Hello</article>', 'article'],
  ['gemini', () => new GeminiWavelet(), '<user-query><p class="query-text-line">Hello</p></user-query>', 'user-query'],
] as const)('%s generated message IDs', (provider, createWavelet, html, selector) => {
  it('creates a fresh ID for every capture while preserving the message and timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-06T12:00:00Z'));
    document.body.innerHTML = html;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('Missing message fixture');

    const wavelet = createWavelet();
    const first = wavelet.extractMessage(element);
    const second = wavelet.extractMessage(element);
    vi.setSystemTime(new Date('2025-01-07T12:00:00Z'));
    const nextVisit = createWavelet().extractMessage(element);

    expect(first).toMatchObject({
      llm_provider: provider,
      message_type: 'user_question',
      message_content: 'Hello',
      timestamp: '2025-01-06T12:00:00.000Z',
    });
    expect(second).toMatchObject({
      llm_provider: provider,
      message_type: 'user_question',
      message_content: 'Hello',
      timestamp: '2025-01-06T12:00:00.000Z',
    });
    expect(nextVisit).toMatchObject({
      llm_provider: provider,
      message_type: 'user_question',
      message_content: 'Hello',
      timestamp: '2025-01-07T12:00:00.000Z',
    });
    const ids = [first?.message_id, second?.message_id, nextVisit?.message_id];
    expect(new Set(ids).size).toBe(3);
    ids.forEach(id => expect(id).toMatch(uuidSuffix));
  });

  it('still captures messages when randomUUID is unavailable', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    document.body.innerHTML = html;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('Missing message fixture');

    const wavelet = createWavelet();
    const first = wavelet.extractMessage(element);
    const second = wavelet.extractMessage(element);

    expect(first?.message_id).toMatch(uuidSuffix);
    expect(second?.message_id).toMatch(uuidSuffix);
    expect(first?.message_id).not.toBe(second?.message_id);
    expect(first?.message_content).toBe('Hello');
  });
});

describe('site-provided message IDs', () => {
  it.each([
    [
      () => new ChatGPTWavelet(),
      '<article data-message-author-role="user" data-message-id="native-id">Hello</article>',
      'article',
      'native-id',
    ],
    [
      () => new DeepSeekWavelet(),
      '<div data-virtual-list-item-key="native-id"><article class="ds-message">Hello</article></div>',
      'article',
      /-native-id$/,
    ],
    [
      () => new GeminiWavelet(),
      '<div class="conversation-container" id="native-id"><user-query><p class="query-text-line">Hello</p></user-query></div>',
      'user-query',
      'native-id-user',
    ],
  ] as const)('keeps the existing native ID', (createWavelet, html, selector, expected) => {
    document.body.innerHTML = html;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('Missing message fixture');

    const messageId = createWavelet().extractMessage(element)?.message_id;
    if (expected instanceof RegExp) expect(messageId).toMatch(expected);
    else expect(messageId).toBe(expected);
  });
});

describe('journey observations across visits', () => {
  it.each([
    [() => new ClaudeFixture(), '<article data-testid="user-message">Hello</article>', false],
    [
      () => new ChatGPTFixture(),
      '<article data-message-author-role="user" data-message-id="native-id">Hello</article>',
      true,
    ],
  ] as const)('sends the same message again in a new visit', async (createWavelet, html, hasNativeId) => {
    vi.useFakeTimers();
    vi.mocked(runtime.sendMessage).mockResolvedValue({ status: 'success' });
    document.body.innerHTML = html;
    const element = document.querySelector<HTMLElement>('article');
    if (!element) throw new Error('Missing message fixture');

    vi.setSystemTime(new Date('2025-01-06T12:00:00Z'));
    createWavelet().process(element);
    await vi.advanceTimersByTimeAsync(2000);
    vi.setSystemTime(new Date('2025-01-07T12:00:00Z'));
    createWavelet().process(element);
    await vi.advanceTimersByTimeAsync(2000);

    const calls = vi.mocked(runtime.sendMessage).mock.calls;
    expect(calls).toHaveLength(2);
    const first = calls[0][0].data;
    const second = calls[1][0].data;
    expect(first.message_content).toBe('Hello');
    expect(second.message_content).toBe('Hello');
    expect(first.timestamp).toMatch(/^2025-01-06/);
    expect(second.timestamp).toMatch(/^2025-01-07/);
    if (hasNativeId) expect(first.message_id).toBe(second.message_id);
    else expect(first.message_id).not.toBe(second.message_id);
  });
});
