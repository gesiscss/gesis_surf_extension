// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { FacebookFeedWavelet } from '../FacebookFeedWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));

setupDOM('www.facebook.com');

function article(extra = '', permalink = 'https://www.facebook.com/alice/posts/pfbidExample'): HTMLElement {
  return fixture(`<div role="article">
    <div data-ad-rendering-role="profile_name"><a href="https://www.facebook.com/alice">Alice</a></div>
    <div data-ad-rendering-role="story_message">A public story</div>
    <a href="${permalink}">Timestamp</a>${extra}</div>`);
}

describe('Facebook feed extraction', () => {
  it('captures public identity, content and localized engagement counts', () => {
    const post = article(`<abbr title="Public"></abbr>
      <div aria-label="Like"><span dir="auto">1,2 mil</span></div>
      <div aria-label="Comment"><span dir="auto">2,345</span></div>
      <div aria-label="Share"><span dir="auto">3M</span></div>`);
    expect(new FacebookFeedWavelet().extractPost(post)).toMatchObject({
      id: 'pfbidExample',
      platform: 'facebook',
      signal_type: 'feed',
      author_handle: 'alice',
      author_display_name: 'Alice',
      content_text: 'A public story',
      is_public: true,
      is_ad: false,
      likes: 1200,
      comments: 2345,
      shares: 3000000,
      post_type: 'text',
    });
  });

  it.each([
    '<blockquote><abbr title="Public"></abbr></blockquote>',
    '<div data-ad-rendering-role="story_message"><abbr title="Public"></abbr></div>',
    '',
  ])('does not disclose private identity or text based on an embedded public marker: %s', extra => {
    expect(new FacebookFeedWavelet().extractPost(article(extra))).toMatchObject({
      is_public: false,
      author_handle: '[private]',
      author_display_name: '[private]',
      content_text: '[private]',
    });
  });

  it.each([
    ['a[aria-label]', '<a aria-label="Sponsored"></a>'],
    ['header text', ''],
    ['ads link', '<a href="https://www.facebook.com/ads/example"></a>'],
    ['CTA', '<div data-ad-rendering-role="cta-"></div>'],
  ])('captures sponsored posts without post permalinks using %s', (_, marker) => {
    const wavelet = new FacebookFeedWavelet();
    const post = article(marker, '');
    if (_ === 'header text') {
      post.querySelector('[data-ad-rendering-role="profile_name"]')?.append(' Sponsored');
    }
    const result = wavelet.extractPost(post);
    expect(result).toMatchObject({
      is_ad: true,
      is_public: true,
      author_handle: 'alice',
      content_text: 'A public story',
      permalink: 'https://www.facebook.com/alice',
    });
    expect(result?.id).toMatch(/^ad_/);
    expect(wavelet.extractPost(post)?.id).toBe(result?.id);
  });

  it.each([
    ['https://www.facebook.com/alice/posts/12345', '12345'],
    ['https://www.facebook.com/watch/?v=678', '678'],
    ['https://www.facebook.com/photo/?fbid=456', '456'],
  ])('extracts IDs from %s', (url, id) => {
    expect(new FacebookFeedWavelet().extractPost(article('<abbr title="Public"></abbr>', url))?.id).toBe(id);
  });

  it.each([
    ['<video></video>', 'video'],
    ['<img src="https://fixture.test/image">', 'image'],
  ])('classifies media %s', (media, type) => {
    expect(new FacebookFeedWavelet().extractPost(article(media))?.post_type).toBe(type);
  });

  it('uses fallback profile links and preserves numeric profile IDs', () => {
    const post = fixture(`<div><a href="https://www.facebook.com/profile.php?id=42">Page</a>
      <div data-ad-rendering-role="story_message">News</div><abbr title="Public"></abbr></div>`);
    expect(new FacebookFeedWavelet().extractPost(post)).toMatchObject({
      author_handle: '42',
      author_display_name: 'Page',
      content_text: 'News',
    });
  });

  it('rejects unidentified articles and articles without an ID or content', () => {
    const wavelet = new FacebookFeedWavelet();
    expect(wavelet.extractPost(fixture('<div>Not a post</div>'))).toBeNull();
    expect(
      wavelet.extractPost(
        fixture(
          '<div><div data-ad-rendering-role="profile_name"><a href="https://www.facebook.com/alice">Alice</a></div></div>',
        ),
      ),
    ).toBeNull();
  });

  it('filters loading placeholders and comments, deduplicates rescans and recaptures on a later visit', async () => {
    const valid = article('<abbr title="Public"></abbr>');
    const loading = valid.cloneNode(true);
    if (!(loading instanceof HTMLElement)) throw new Error('Expected article');
    loading.setAttribute('aria-label', 'Loading');
    document.body.append(loading);
    const comment = document.createElement('div');
    comment.setAttribute('role', 'article');
    comment.innerHTML = '<a href="https://www.facebook.com/alice/posts/999">Comment</a>';
    document.body.append(comment);

    new FacebookFeedWavelet().initialize();
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'FACEBOOK_POST', data: expect.objectContaining({ id: 'pfbidExample' }) }),
    );
    new FacebookFeedWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('finds posts in the alternative layout without article wrappers', () => {
    const post = article('<abbr title="Public"></abbr>');
    post.removeAttribute('role');
    new FacebookFeedWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'pfbidExample' }) }),
    );
  });
});
