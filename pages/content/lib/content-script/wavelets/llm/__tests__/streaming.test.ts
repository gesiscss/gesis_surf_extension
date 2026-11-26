// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime, storage } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { ChatGPTWavelet } from '../ChatGPTWavelet';
import { ClaudeWavelet } from '../ClaudeWavelet';
import { DeepSeekWavelet } from '../DeepSeekWavelet';
import { GeminiWavelet } from '../GeminiWavelet';
import { initializeLLMTracking } from '../LLMRegistry';
import { fixture, setupDOM } from '../../socials/__tests__/fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
  storage: { local: { get: vi.fn(async () => ({})) } },
}));
setupDOM('chatgpt.com');

function messagePayloads() {
  return vi.mocked(runtime.sendMessage).mock.calls.map(([message]) => message.data);
}

describe('LLM streaming and capture lifecycle', () => {
  it('captures ChatGPT text mutations after silence and suppresses repeated native IDs', async () => {
    const root = fixture('<div data-message-author-role="assistant" data-message-id="reply"></div>');
    new ChatGPTWavelet().initialize();
    root.textContent = 'Partial';
    await vi.advanceTimersByTimeAsync(1000);
    if (!(root.firstChild instanceof Text)) throw new Error('Expected streaming text');
    root.firstChild.data = 'Final answer';
    await vi.advanceTimersByTimeAsync(1499);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(messagePayloads()).toEqual([
      expect.objectContaining({
        llm_provider: 'chatgpt',
        message_id: 'reply',
        message_content: 'Final answer',
        message_type: 'ai_response',
      }),
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    root.firstChild.data = 'Later mutation';
    await vi.advanceTimersByTimeAsync(2000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('waits for DOM ready, scans existing questions and handles nested inserted replies', async () => {
    Object.assign(location, { pathname: '/c/session', href: 'https://chatgpt.com/c/session' });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    fixture('<div data-message-author-role="user" data-message-id="question">Question</div>');
    const wavelet = new ChatGPTWavelet();
    wavelet.initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const wrapper = document.createElement('section');
    wrapper.innerHTML = '<div data-message-author-role="assistant" data-message-id="reply">Answer</div>';
    document.body.append(wrapper, document.createTextNode('Ignore text'));
    await vi.advanceTimersByTimeAsync(1500);
    expect(messagePayloads()).toEqual([
      expect.objectContaining({ message_id: 'question', chat_session_id: 'session', turn_index: 1 }),
      expect.objectContaining({ message_id: 'reply', chat_session_id: 'session', turn_index: 2 }),
    ]);
  });

  it.each([false, true])('does not capture when disabled or on a nonmatching site: %s', wrongSite => {
    fixture('<div data-message-author-role="user">Question</div>');
    const config: SelectorConfig = {
      family: 'llm',
      provider: 'chatgpt',
      version: 'test',
      hostname_patterns: [wrongSite ? 'other.test' : 'chatgpt.com'],
      selectors: {},
      is_active: wrongSite,
    };
    new ChatGPTWavelet(config).initialize();
    expect(vi.getTimerCount()).toBe(0);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('logs rejected background sends for LLM captures', async () => {
    const error = new Error('Background unavailable');
    vi.mocked(runtime.sendMessage).mockRejectedValueOnce(error);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture('<div data-message-author-role="user" data-message-id="question">Question</div>');
    new ChatGPTWavelet().initialize();
    await vi.advanceTimersByTimeAsync(1500);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Send failed'), error);
  });

  it.each(['missing', 'unavailable', 'configured'])('initializes LLMs with %s storage', async mode => {
    if (mode === 'unavailable') vi.mocked(storage.local.get).mockRejectedValueOnce(new Error('Unavailable'));
    if (mode === 'configured')
      vi.mocked(storage.local.get).mockResolvedValueOnce({
        selectors: {
          chatgpt: {
            family: 'llm',
            provider: 'chatgpt',
            version: 'test',
            is_active: true,
            hostname_patterns: ['chatgpt.com'],
            selectors: { content: ['[', '.missing', '.custom'] },
          },
        },
      });
    fixture(
      '<div data-message-author-role="user" data-message-id="question"><span class="custom">Question</span></div>',
    );
    await initializeLLMTracking();
    await vi.advanceTimersByTimeAsync(1500);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'LLM_MESSAGE', data: expect.objectContaining({ message_content: 'Question' }) }),
    );
  });

  it('captures Gemini only after aria-busy clears, with ordered native turn IDs', async () => {
    Object.assign(location, { hostname: 'gemini.google.com', pathname: '/app/session' });
    const root = fixture(`<div class="conversation-container" id="turn">
      <user-query><p class="query-text-line">First line</p><p class="query-text-line">Second line</p></user-query>
      <model-response><div class="markdown markdown-main-panel" aria-busy="true">Partial</div></model-response></div>`);
    new GeminiWavelet().initialize();
    await vi.advanceTimersByTimeAsync(500);
    expect(messagePayloads()).toEqual([
      expect.objectContaining({
        message_id: 'turn-user',
        message_content: 'First line\nSecond line',
        turn_index: 1,
      }),
    ]);
    const markdown = root.querySelector('.markdown');
    if (!markdown) throw new Error('Missing markdown');
    markdown.textContent = 'Final response';
    markdown.setAttribute('aria-busy', 'false');
    await vi.advanceTimersByTimeAsync(1000);
    expect(messagePayloads()[1]).toMatchObject({
      message_id: 'turn-model',
      message_content: 'Final response',
      turn_index: 2,
      chat_session_id: 'session',
    });
  });

  it('watches Gemini responses whose markdown arrives after their container', async () => {
    Object.assign(location, { hostname: 'gemini.google.com' });
    const root = fixture('<model-response></model-response>');
    new GeminiWavelet().initialize();
    root.innerHTML = '<div class="markdown markdown-main-panel">Delayed answer</div>';
    await vi.advanceTimersByTimeAsync(500);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: expect.objectContaining({ message_type: 'ai_response', message_content: 'Delayed answer' }),
      }),
    );
  });

  it('captures already-complete Gemini responses and ignores unrelated/empty elements', async () => {
    Object.assign(location, { hostname: 'gemini.google.com' });
    const root = fixture('<model-response><div class="markdown markdown-main-panel">Complete</div></model-response>');
    const wavelet = new GeminiWavelet();
    wavelet.initialize();
    await vi.advanceTimersByTimeAsync(500);
    expect(messagePayloads()[0]).toMatchObject({ message_content: 'Complete', message_type: 'ai_response' });
    expect(wavelet.extractMessage(document.body)).toBeNull();
    root.replaceChildren();
    expect(wavelet.extractMessage(root)).toBeNull();
  });

  it('waits for Claude completion and joins response blocks while capturing user questions', async () => {
    Object.assign(location, { hostname: 'claude.ai', pathname: '/chat/session' });
    const root = fixture(`<section>
      <div data-testid="user-message"><span class="whitespace-pre-wrap">Question</span></div>
      <div data-is-streaming="true"><div class="font-claude-response-body">First</div>
      <div class="font-claude-response-body">Second</div></div></section>`);
    new ClaudeWavelet().initialize();
    await vi.advanceTimersByTimeAsync(500);
    expect(messagePayloads()).toHaveLength(1);
    const response = root.querySelector('[data-is-streaming]');
    response?.setAttribute('data-is-streaming', 'false');
    await Promise.resolve();
    expect(messagePayloads()[1]).toMatchObject({
      llm_provider: 'claude',
      message_type: 'ai_response',
      message_content: 'First\n\nSecond',
      chat_session_id: 'session',
      turn_index: 2,
    });
  });

  it('captures already-complete Claude replies and rejects empty/unrelated elements', () => {
    Object.assign(location, { hostname: 'claude.ai' });
    const root = fixture('<div data-is-streaming="false"><div class="font-claude-response-body">Complete</div></div>');
    const wavelet = new ClaudeWavelet();
    wavelet.initialize();
    expect(messagePayloads()[0]).toMatchObject({ message_content: 'Complete' });
    root.replaceChildren();
    expect(wavelet.extractMessage(root)).toBeNull();
    expect(wavelet.extractMessage(document.body)).toBeNull();
  });

  it('captures DeepSeek streaming without reasoning content and preserves virtual-list IDs', async () => {
    Object.assign(location, { hostname: 'chat.deepseek.com', pathname: '/a/chat/session' });
    const root = fixture(
      '<div data-virtual-list-item-key="42"><div class="ds-message"><div class="ds-markdown"></div></div></div>',
    );
    new DeepSeekWavelet().initialize();
    const markdown = root.querySelector('.ds-markdown');
    if (!markdown) throw new Error('Missing markdown');
    markdown.innerHTML = '<div class="ds-think-content">Private reasoning</div><p>Final answer</p>';
    await vi.advanceTimersByTimeAsync(1500);
    expect(messagePayloads()).toEqual([
      expect.objectContaining({
        llm_provider: 'deepseek',
        message_type: 'ai_response',
        message_content: 'Final answer',
        message_id: 'session-42',
        turn_index: 1,
      }),
    ]);
    await vi.advanceTimersByTimeAsync(2500);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('captures DeepSeek questions and late markdown insertion in existing messages', async () => {
    Object.assign(location, { hostname: 'chat.deepseek.com', pathname: '/chat/session' });
    const root = fixture('<div data-virtual-list-item-key="1"><div class="ds-message">Question</div></div>');
    new DeepSeekWavelet().initialize();
    await vi.advanceTimersByTimeAsync(1500);
    expect(messagePayloads()[0]).toMatchObject({ message_type: 'user_question', message_id: 'session-1' });
    root.insertAdjacentHTML('beforeend', '<div data-virtual-list-item-key="2"><div class="ds-message"></div></div>');
    await Promise.resolve();
    root
      .querySelector('[data-virtual-list-item-key="2"] .ds-message')
      ?.insertAdjacentHTML('beforeend', '<div class="ds-markdown">Answer</div>');
    await vi.advanceTimersByTimeAsync(1500);
    expect(messagePayloads()[1]).toMatchObject({ message_type: 'ai_response', message_id: 'session-2' });
  });
});
