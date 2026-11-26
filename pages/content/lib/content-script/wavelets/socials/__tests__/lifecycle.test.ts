// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime, storage } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { RedditFeedWavelet } from '../RedditFeedWavelet';
import { initializeSocialTracking } from '../SocialRegistry';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
  storage: { local: { get: vi.fn(async () => ({})) } },
}));
setupDOM('www.reddit.com');

const config: SelectorConfig = {
  family: 'social',
  provider: 'reddit',
  version: 'test',
  hostname_patterns: ['reddit.com'],
  selectors: {},
  is_active: true,
};

describe('social capture lifecycle and registry', () => {
  it('waits for DOM readiness and processes elements but not text mutations', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    fixture('<shreddit-post id="existing"></shreddit-post>');
    new RedditFeedWavelet().initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    document.body.append(document.createTextNode('not a post'));
    const root = document.createElement('section');
    root.innerHTML = '<shreddit-post id="inserted"></shreddit-post>';
    document.body.append(root);
    await Promise.resolve();
    expect(vi.mocked(runtime.sendMessage).mock.calls.map(([message]) => message.data.id)).toEqual([
      'existing',
      'inserted',
    ]);
  });

  it('rescans after delayed rendering even without an observed attribute', async () => {
    const root = fixture('<shreddit-post></shreddit-post>');
    new RedditFeedWavelet().initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    root.id = 'late';
    await vi.advanceTimersByTimeAsync(1500);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'late' }) }),
    );
    await vi.advanceTimersByTimeAsync(6500);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('routes deferred attribute rendering and falls back past invalid and missing selectors', async () => {
    const root = fixture('<section></section>');
    new RedditFeedWavelet({
      ...config,
      selectors: { shreddit_post: ['[', '.missing', '[data-testid="post"]'] },
    }).initialize();
    root.id = 'late';
    root.setAttribute('data-testid', 'post');
    await Promise.resolve();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'late' }) }),
    );
  });

  it.each([
    { ...config, is_active: false },
    { ...config, hostname_patterns: ['other.test'] },
  ])('does not capture disabled or nonmatching pages: %j', settings => {
    fixture('<shreddit-post id="existing"></shreddit-post>');
    new RedditFeedWavelet(settings).initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('logs a rejected send without an unhandled promise rejection', async () => {
    const error = new Error('Background unavailable');
    vi.mocked(runtime.sendMessage).mockRejectedValueOnce(error);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture('<shreddit-post id="existing"></shreddit-post>');
    new RedditFeedWavelet().initialize();
    await vi.advanceTimersByTimeAsync(0);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Send failed'), error);
  });

  it('passes stored provider selectors to the matching extractor', async () => {
    vi.mocked(storage.local.get).mockResolvedValueOnce({
      selectors: { reddit: { ...config, selectors: { shreddit_post: ['section.custom'] } } },
    });
    fixture('<section class="custom" id="custom-post"></section>');
    await initializeSocialTracking();
    expect(storage.local.get).toHaveBeenCalledWith('selectors');
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'REDDIT_POST', data: expect.objectContaining({ id: 'custom-post' }) }),
    );
  });

  it.each(['missing', 'unavailable'])('falls back to built-in selectors when storage is %s', async mode => {
    if (mode === 'unavailable') vi.mocked(storage.local.get).mockRejectedValueOnce(new Error('Storage unavailable'));
    else vi.mocked(storage.local.get).mockResolvedValueOnce({});
    fixture('<shreddit-post id="fallback"></shreddit-post>');
    await initializeSocialTracking();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'REDDIT_POST', data: expect.objectContaining({ id: 'fallback' }) }),
    );
  });

  it('honors backend deactivation loaded by the registry', async () => {
    vi.mocked(storage.local.get).mockResolvedValueOnce({ selectors: { reddit: { ...config, is_active: false } } });
    fixture('<shreddit-post id="disabled"></shreddit-post>');
    await initializeSocialTracking();
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
});
