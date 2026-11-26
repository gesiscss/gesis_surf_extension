// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { RedditFeedWavelet } from '../RedditFeedWavelet';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));

describe('Reddit feed capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { hostname: 'www.reddit.com', href: 'https://www.reddit.com/' });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    vi.mocked(runtime.sendMessage).mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('extracts post metadata and rejects elements without an ID', () => {
    const wavelet = new RedditFeedWavelet();
    const post = document.createElement('shreddit-post');
    expect(wavelet.extractPost(post)).toBeNull();

    post.setAttribute('data-post-id', 'post-1');
    post.setAttribute('author', 'alice');
    post.setAttribute('post-title', 'Example');
    post.setAttribute('permalink', '/r/example/comments/post-1');
    post.setAttribute('subreddit-name', 'example');
    post.setAttribute('post-type', 'image');
    post.setAttribute('score', '42');
    post.setAttribute('comment-count', '7');
    post.setAttribute('award-count', '2');
    post.setAttribute('created-timestamp', '2025-01-01T12:00:00Z');
    post.setAttribute('promoted', '');

    expect(wavelet.extractPost(post)).toEqual(
      expect.objectContaining({
        id: 'post-1',
        platform: 'reddit',
        signal_type: 'feed',
        author_handle: 'alice',
        content_text: 'Example',
        permalink: 'https://www.reddit.com/r/example/comments/post-1',
        subreddit: 'example',
        post_type: 'image',
        likes: 42,
        comments: 7,
        awards: 2,
        post_timestamp: '2025-01-01T12:00:00Z',
        is_ad: true,
        page_url: 'https://www.reddit.com/',
      }),
    );
  });

  it('captures existing and added posts once per instance, allowing a later visit to recapture them', async () => {
    document.body.innerHTML = '<shreddit-post id="post-1"></shreddit-post>';
    const config = {
      family: 'social' as const,
      provider: 'reddit',
      version: 'test',
      hostname_patterns: ['reddit.com'],
      selectors: { shreddit_post: ['[', 'shreddit-post'] },
      is_active: true,
    };
    new RedditFeedWavelet(config).initialize();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'REDDIT_POST', data: expect.objectContaining({ id: 'post-1' }) }),
    );

    const added = document.createElement('shreddit-post');
    added.id = 'post-2';
    document.body.append(added);
    await Promise.resolve();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'REDDIT_POST', data: expect.objectContaining({ id: 'post-2' }) }),
    );

    added.setAttribute('data-testid', 'rendered');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);

    new RedditFeedWavelet(config).initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
    expect(
      vi
        .mocked(runtime.sendMessage)
        .mock.calls.slice(2)
        .map(([message]) => message.data.id),
    ).toEqual(['post-1', 'post-2']);
  });
});
