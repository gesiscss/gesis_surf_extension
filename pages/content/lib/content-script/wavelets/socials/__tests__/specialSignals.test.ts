// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { TikTokWavelet } from '../TikTokWavelet';
import { TikTokPlayedWavelet } from '../TikTokPlayedWavelet';
import { TwitchStreamWavelet } from '../TwitchStreamWavelet';
import { YouTubeShortsWavelet } from '../YouTubeShortsWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.tiktok.com');

function tiktok(): HTMLElement {
  return fixture(`<div class="DivContentFlexLayout"><section data-e2e="feed-video">
    <div id="xgwrapper-0-123"><video></video></div></section>
    <a data-e2e="video-author-avatar" href="/@alice"></a><div><p>Alice</p>
    <svg><path fill="#20D5EC"></path></svg></div>
    <span data-e2e="desc-span-1">First </span><span data-e2e="desc-span-2">caption</span>
    <span data-e2e="like-count">1.2K</span><span data-e2e="comment-count">2M</span>
    <span data-e2e="share-count">3B</span><button aria-label="4.5K added to Favorites"></button>
    <a data-e2e="video-music" href="/music/fixture-456" aria-label="Watch more videos with music Fixture track"></a>
    </div>`);
}

describe('special social capture signals', () => {
  it('distinguishes TikTok exposure from play with configured verification and preserved positions', async () => {
    const root = tiktok();
    const config: SelectorConfig = {
      family: 'social',
      provider: 'tiktok',
      version: 'test',
      hostname_patterns: ['tiktok.com'],
      is_active: true,
      selectors: { verified_check: ['path[fill="#20D5EC"]'] },
    };
    new TikTokWavelet(config).initialize();
    new TikTokPlayedWavelet(config).initialize();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'TIKTOK_POST',
        data: expect.objectContaining({
          id: '123',
          signal_type: 'feed',
          feed_position: 1,
          author_handle: '@alice',
          author_display_name: 'Alice',
          is_verified: true,
          content_text: 'First caption',
          likes: 1200,
          comments: 2000000,
          shares: 3000000000,
          favorites: 4500,
          music_id: '456',
          music_name: 'Fixture track',
        }),
      }),
    );
    const video = root.querySelector('video');
    video?.dispatchEvent(new Event('play'));
    video?.dispatchEvent(new Event('play'));
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'TIKTOK_PLAYED',
        data: expect.objectContaining({ signal_type: 'played', feed_position: 1 }),
      }),
    );
  });

  it('does not capture TikTok playback after navigation into private areas or outside a post', () => {
    const root = tiktok();
    new TikTokPlayedWavelet().initialize();
    location.pathname = '/messages';
    root.querySelector('video')?.dispatchEvent(new Event('play'));
    location.pathname = '/foryou';
    const orphan = document.createElement('video');
    document.body.append(orphan);
    orphan.dispatchEvent(new Event('play'));
    root.dispatchEvent(new Event('play'));
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['/messages', '/inbox', '/live', '/foryou/messages'])('does not start TikTok capture on %s', path => {
    location.pathname = path;
    tiktok();
    new TikTokWavelet().initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects incomplete TikTok posts and uses numeric metric fallbacks', () => {
    const wavelet = new TikTokWavelet();
    expect(wavelet.extractPost(fixture('<div></div>'))).toBeNull();
    expect(wavelet.extractPost(fixture('<div><div id="xgwrapper-0-"></div></div>'))).toBeNull();
    expect(wavelet.extractPost(fixture('<div><div id="xgwrapper-0-123"></div></div>'))).toBeNull();
    const root = tiktok();
    const count = root.querySelector('[data-e2e="like-count"]');
    if (!count) throw new Error('Missing fixture metric');
    count.textContent = 'hidden';
    root.querySelector('[data-e2e="comment-count"]')?.remove();
    root.querySelector('button')?.remove();
    expect(wavelet.extractPost(root)).toMatchObject({ likes: 0, comments: 0, favorites: 0 });
  });

  it('retries Shorts overlays, captures SPA navigation once and waits for DOM readiness', async () => {
    Object.assign(location, { hostname: 'www.youtube.com', pathname: '/shorts/first' });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    new YouTubeShortsWavelet().initialize();
    await vi.advanceTimersByTimeAsync(400);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(400);
    fixture(`<ytd-reel-player-overlay-renderer><a href="/@alice/shorts"></a>
      <yt-shorts-video-title-view-model><h2>Short title</h2></yt-shorts-video-title-view-model>
      <like-button-view-model><button aria-label="46,278 likes"></button></like-button-view-model>
      <button aria-label="View 1,950 comments"></button></ytd-reel-player-overlay-renderer>`);
    await vi.advanceTimersByTimeAsync(400);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'YOUTUBE_SHORT',
        data: expect.objectContaining({
          id: 'first',
          signal_type: 'feed',
          author_handle: 'alice',
          content_text: 'Short title',
          likes: 46278,
          comments: 1950,
        }),
      }),
    );
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(400);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    location.pathname = '/shorts/second';
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(400);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    location.pathname = '/watch';
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(400);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('stops Shorts retries when the overlay never appears', async () => {
    Object.assign(location, { hostname: 'www.youtube.com', pathname: '/shorts/missing' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new YouTubeShortsWavelet().initialize();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('captures Twitch stream metadata after a viewer-count retry and detects channel navigation', async () => {
    Object.assign(location, { hostname: 'www.twitch.tv', pathname: '/alice' });
    const root = fixture(`<div id="live-channel-stream-information">
      <p data-a-target="stream-title">Stream title</p><h1 class="tw-title">Alice</h1>
      <a data-a-target="stream-game-link">Science</a><span class="tw-tag">English</span>
      <span class="tw-channel-status-text-indicator">LIVE</span><svg aria-label="Verified Partner"></svg>
      <div class="live-time"><span>01:23:45</span></div>
      <strong data-a-target="animated-channel-viewers-count">0</strong></div>`);
    new TwitchStreamWavelet().initialize();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    const count = root.querySelector('strong');
    if (!count) throw new Error('Missing fixture viewer count');
    count.textContent = '1.2K';
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'TWITCH_STREAM',
        data: expect.objectContaining({
          author_handle: 'alice',
          signal_type: 'played',
          content_text: 'Stream title',
          viewer_count: 1200,
          game_name: 'Science',
          tags: ['English'],
          stream_duration: '01:23:45',
          is_live: true,
          is_verified: true,
        }),
      }),
    );
    location.pathname = '/bob';
    await vi.advanceTimersByTimeAsync(1500);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ author_handle: 'bob' }),
      }),
    );
    location.pathname = '/directory/category';
    await vi.advanceTimersByTimeAsync(2000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['12:34', '12:34'],
    ['not a duration', undefined],
  ])('parses Twitch duration %s', (value, expected) => {
    Object.assign(location, { hostname: 'www.twitch.tv', pathname: '/alice' });
    const root = fixture(`<div><div class="live-time"><span>${value}</span></div></div>`);
    expect(new TwitchStreamWavelet().extractPost(root)).toMatchObject({
      stream_duration: expected,
      viewer_count: 0,
      author_display_name: 'alice',
      is_live: false,
    });
  });
});
