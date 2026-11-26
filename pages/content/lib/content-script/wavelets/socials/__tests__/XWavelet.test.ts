// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { XWavelet } from '../XWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('x.com');

function tweet(extra = ''): HTMLElement {
  return fixture(`<article data-testid="tweet">
    <a href="https://x.com/alice/status/123">Post</a>
    <div data-testid="User-Name"><span>Alice</span><svg data-testid="icon-verified"></svg></div>
    <div data-testid="tweetText">Public update</div><time datetime="2026-01-01T12:00:00Z"></time>
    <div role="group" aria-label="3 replies 4 reposts 1,234 likes 2 bookmarks 5,678 views"></div>
    ${extra}</article>`);
}

describe('X feed capture', () => {
  it('extracts public metadata, metrics and ad/video signals', () => {
    expect(
      new XWavelet().extractPost(tweet('<video></video><span data-testid="promotedIndicator"></span>')),
    ).toMatchObject({
      id: '123',
      author_handle: '@alice',
      author_display_name: 'Alice',
      content_text: 'Public update',
      is_public: true,
      is_protected: false,
      is_verified: true,
      is_ad: true,
      post_type: 'video',
      replies: 3,
      reposts: 4,
      likes: 1234,
      bookmarks: 2,
      views: 5678,
      comments: 3,
    });
  });

  it('redacts private content and identity when reposting is disabled', () => {
    expect(new XWavelet().extractPost(tweet('<button data-testid="retweet" disabled></button>'))).toMatchObject({
      is_protected: true,
      is_public: false,
      author_handle: '[private]',
      author_display_name: '[private]',
      content_text: '[private]',
    });
  });

  it('classifies photos and rejects public posts without text or IDs', () => {
    const wavelet = new XWavelet();
    const root = tweet('<div data-testid="tweetPhoto"></div>');
    expect(wavelet.extractPost(root)?.post_type).toBe('image');
    root.querySelector('[data-testid="tweetText"]')?.remove();
    expect(wavelet.extractPost(root)).toBeNull();
    expect(wavelet.extractPost(fixture('<article></article>'))).toBeNull();
    expect(wavelet.extractPost(fixture('<article><a href="https://x.com/alice/status/">Bad</a></article>'))).toBeNull();
  });

  it.each(['/messages', '/i/settings', '/i/sessions', '/i/display', '/i/accessibility'])(
    'does not initialize on excluded path %s',
    pathname => {
      location.pathname = pathname;
      tweet();
      new XWavelet().initialize();
      expect(runtime.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('captures deferred tweet attributes and stops processing after SPA navigation to messages', async () => {
    const root = tweet();
    root.removeAttribute('data-testid');
    new XWavelet().initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    root.setAttribute('data-testid', 'tweet');
    await Promise.resolve();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'X_POST', data: expect.objectContaining({ id: '123' }) }),
    );
    location.pathname = '/messages';
    const other = root.cloneNode(true);
    if (!(other instanceof HTMLElement)) throw new Error('Expected tweet');
    other.querySelector('a')?.setAttribute('href', 'https://x.com/alice/status/456');
    document.body.append(other);
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
