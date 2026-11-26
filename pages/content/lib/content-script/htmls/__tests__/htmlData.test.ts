// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { initializeHTMLCapture } from '../htmlData';

vi.mock('webextension-polyfill', () => ({
  runtime: {
    sendMessage: vi.fn(async () => ({ status: 'success' })),
    onMessage: { addListener: vi.fn() },
  },
}));

describe('HTML capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('sends one snapshot after the page settles and cancels the hard-cap capture', async () => {
    initializeHTMLCapture();
    await vi.advanceTimersByTimeAsync(999);
    expect(runtime.sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'HTML_CAPTURE',
      data: {
        html_content: document.documentElement.outerHTML,
        meta: { title: document.title, description: '', favicon_url: '' },
      },
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('reports a failed scheduled capture without an unhandled rejection', async () => {
    const error = new Error('Snapshot unavailable');
    vi.spyOn(document.documentElement, 'cloneNode').mockImplementation(() => {
      throw error;
    });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    initializeHTMLCapture();
    await vi.advanceTimersByTimeAsync(5000);

    expect(logError).toHaveBeenCalledExactlyOnceWith('📄[HTML] Error capturing HTML:', error);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a failed requested capture without an unhandled rejection', async () => {
    const error = new Error('Snapshot unavailable');
    vi.spyOn(document.documentElement, 'cloneNode').mockImplementation(() => {
      throw error;
    });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    initializeHTMLCapture();
    const listener = vi.mocked(runtime.onMessage.addListener).mock.calls[0][0];
    listener({ type: 'REQUEST_HTML_CAPTURE' }, {}, vi.fn());
    await Promise.resolve();

    expect(logError).toHaveBeenCalledExactlyOnceWith('📄[HTML] Error capturing HTML:', error);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
});
