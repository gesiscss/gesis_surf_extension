// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { YouTubeFeedWavelet } from '../YouTubeFeedWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.youtube.com');

function card(metadata = '1.2M views 2 days ago'): HTMLElement {
  return fixture(`<ytd-rich-item-renderer>
    <a href="https://www.youtube.com/watch?v=fixture1234" aria-label="Fixture title 12:34"></a>
    <a href="/@alice">Alice</a><yt-content-metadata-view-model>${metadata}</yt-content-metadata-view-model>
    </ytd-rich-item-renderer>`);
}

describe('YouTube feed capture', () => {
  it('captures exposure rather than playback with video, author and time metadata', () => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    expect(new YouTubeFeedWavelet().extractPost(card())).toMatchObject({
      id: 'fixture1234',
      signal_type: 'feed',
      author_handle: 'alice',
      author_display_name: 'Alice',
      content_text: 'Fixture title',
      views: 1200000,
      post_timestamp: '2026-06-13T12:00:00.000Z',
      is_ad: false,
      permalink: 'https://www.youtube.com/watch?v=fixture1234',
    });
  });

  it.each([
    ['527 watching', 527],
    ['79k views', 79000],
    ['2B views', 2000000000],
    ['1,234 views', 1234],
    ['hidden', 0],
    ['999999999999999 views', 0],
  ])('parses feed view count %s', (metadata, views) => {
    expect(new YouTubeFeedWavelet().extractPost(card(metadata))?.views).toBe(views);
  });

  it.each([
    ['1 second ago', '2026-06-15T11:59:59.000Z'],
    ['1 minute ago', '2026-06-15T11:59:00.000Z'],
    ['1 hour ago', '2026-06-15T11:00:00.000Z'],
    ['1 week ago', '2026-06-08T12:00:00.000Z'],
    ['1 month ago', '2026-05-15T12:00:00.000Z'],
    ['1 year ago', '2025-06-15T12:00:00.000Z'],
  ])('parses relative upload time %s', (text, expected) => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    expect(new YouTubeFeedWavelet().extractPost(card(`100 views ${text}`))?.post_timestamp).toBe(expected);
  });

  it('uses fallback title and detects ad slots', () => {
    const root = card();
    root.querySelector('a')?.removeAttribute('aria-label');
    root.insertAdjacentHTML(
      'beforeend',
      '<h3><a><span>Fallback title</span></a></h3><yt-ad-slot-renderer></yt-ad-slot-renderer>',
    );
    expect(new YouTubeFeedWavelet().extractPost(root)).toMatchObject({ content_text: 'Fallback title', is_ad: true });
  });

  it('rejects invalid videos and channel-less mix/playlist cards', () => {
    const wavelet = new YouTubeFeedWavelet();
    expect(wavelet.extractPost(fixture('<div></div>'))).toBeNull();
    expect(wavelet.extractPost(fixture('<div><a href="/watch?v=short"></a></div>'))).toBeNull();
    expect(wavelet.extractPost(fixture('<div><a href="/watch?v=fixture1234"></a></div>'))).toBeNull();
  });

  it('deduplicates initial/retry/mutation scans and recaptures on later visits', async () => {
    card();
    new YouTubeFeedWavelet().initialize();
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'YOUTUBE_POST', data: expect.objectContaining({ id: 'fixture1234' }) }),
    );
    new YouTubeFeedWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
});
