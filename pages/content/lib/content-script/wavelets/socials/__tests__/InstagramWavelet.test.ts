// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { clearJSONPostsCache, InstagramWavelet } from '../InstagramWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.instagram.com');
beforeEach(clearJSONPostsCache);

function article(extra = ''): HTMLElement {
  return fixture(`<article><a href="https://www.instagram.com/p/ABC/">Post</a>
    <span class="_ap3a _aacw">alice</span><div data-testid="caption"><span>Caption</span></div>
    <time datetime="2026-01-01T12:00:00Z"></time>${extra}</article>`);
}

describe('Instagram capture', () => {
  it('extracts DOM caption, engagement, verification and video metadata', () => {
    const post = article(`<section><div class="x6s0dn4">
      <div><button><svg aria-label="Like"></svg></button></div><span class="xe9ewy2">1.5K</span>
      <div><button><svg aria-label="Comment"></svg></button></div><span class="xe9ewy2">1,234</span>
      </div></section><svg aria-label="Verified"></svg><video></video>`);
    expect(new InstagramWavelet().extractPost(post)).toMatchObject({
      id: 'ABC',
      shortcode: 'ABC',
      author_handle: 'alice',
      signal_type: 'feed',
      content_text: 'Caption',
      likes: 1500,
      comments: 1234,
      is_verified: true,
      post_type: 'video',
      is_ad: false,
      post_timestamp: '2026-01-01T12:00:00Z',
    });
  });

  it.each([
    ['2M', 2000000],
    ['1B', 1000000000],
    ['hidden', 0],
    ['', 0],
  ])('parses action count %s', (value, likes) => {
    const post = article(`<section><button><svg aria-label="Like"></svg></button>
        <span class="xe9ewy2">${value}</span></section>`);
    expect(new InstagramWavelet().extractPost(post)?.likes).toBe(likes);
  });

  it('recognizes DOM ads and carousels', () => {
    expect(
      new InstagramWavelet().extractPost(
        article('<span class="x1fhwpqd x132q4wb">Ad</span><div class="_aagu"><ul></ul></div>'),
      ),
    ).toMatchObject({ is_ad: true, post_type: 'carousel' });
  });

  it.each([
    { is_private: false, author: 'alice', caption: 'JSON caption' },
    { is_private: true, author: '[private]', caption: '[private]' },
  ])('prefers embedded JSON and preserves privacy: $is_private', ({ is_private, author, caption }) => {
    const post = article();
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      nested: [
        null,
        1,
        {
          code: 'ABC',
          like_count: 77,
          comment_count: 9,
          taken_at: 1767268800,
          user: { username: 'alice', is_private, is_verified: true },
          caption: { text: 'JSON caption' },
          carousel_media: [],
        },
        { code: 'INVALID', like_count: 1 },
      ],
    });
    document.body.append(script);
    expect(new InstagramWavelet().extractPost(post)).toMatchObject({
      author_handle: author,
      content_text: caption,
      likes: 77,
      comments: 9,
      post_type: 'carousel',
      is_public: !is_private,
      is_verified: true,
      post_timestamp: new Date(1767268800 * 1000).toISOString(),
    });
  });

  it('handles malformed scripts and uses owner/video JSON variants', () => {
    const post = article();
    const malformed = document.createElement('script');
    malformed.type = 'application/json';
    malformed.textContent = '{invalid';
    const valid = document.createElement('script');
    valid.type = 'application/json';
    valid.textContent = JSON.stringify({
      code: 'ABC',
      like_count: 0,
      owner: { username: 'owner' },
      video_versions: [],
    });
    document.body.append(malformed, valid);
    expect(new InstagramWavelet().extractPost(post)).toMatchObject({
      author_handle: 'owner',
      post_type: 'video',
      comments: 0,
      content_text: '',
    });
  });

  it('rejects missing shortcodes and missing authors without embedded JSON', () => {
    const wavelet = new InstagramWavelet();
    expect(wavelet.extractPost(fixture('<article></article>'))).toBeNull();
    expect(
      wavelet.extractPost(fixture('<article><a href="https://www.instagram.com/p/ABC/">Post</a></article>')),
    ).toBeNull();
  });

  it('rescans after scroll and keeps each post once per instance, allowing later visits', async () => {
    article();
    new InstagramWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    const added = document.createElement('article');
    added.innerHTML = '<a href="https://www.instagram.com/p/NEXT/">Post</a><span class="_ap3a _aacw">bob</span>';
    document.body.append(added);
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'INSTAGRAM_POST', data: expect.objectContaining({ id: 'NEXT' }) }),
    );
    new InstagramWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
  });
});
