// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { InstagramWavelet } from '../InstagramWavelet';
import { TikTokPlayedWavelet } from '../TikTokPlayedWavelet';
import { TwitchStreamWavelet } from '../TwitchStreamWavelet';
import { YouTubeShortsWavelet } from '../YouTubeShortsWavelet';
import { YouTubeWatchWavelet } from '../YouTubeWatchWavelet';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));

describe('social Wavelet activation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { hostname: 'fixture.test', pathname: '/idle', href: 'https://fixture.test/idle' });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    vi.mocked(runtime.sendMessage).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it.each([
    {
      provider: 'tiktok',
      Wavelet: TikTokPlayedWavelet,
      path: '/foryou',
      html: '<div class="DivContentFlexLayout"><a data-e2e="video-author-avatar" href="/@fixture"></a><div id="xgwrapper-0-fixture"><video></video></div></div>',
      message: 'TIKTOK_PLAYED',
    },
    {
      provider: 'twitch_stream',
      Wavelet: TwitchStreamWavelet,
      path: '/fixture',
      html: '<div id="live-channel-stream-information"><strong data-a-target="animated-channel-viewers-count">42</strong></div>',
      message: 'TWITCH_STREAM',
    },
    {
      provider: 'youtube_shorts',
      Wavelet: YouTubeShortsWavelet,
      path: '/shorts/fixture',
      html: '<ytd-reel-player-overlay-renderer><a href="/@fixture/shorts"></a></ytd-reel-player-overlay-renderer>',
      message: 'YOUTUBE_SHORT',
    },
  ])('$message follows the backend flag', async ({ provider, Wavelet, path, html, message }) => {
    Object.assign(location, { pathname: path, href: `https://fixture.test${path}` });
    document.body.innerHTML = html;
    const config: SelectorConfig = {
      family: 'social',
      provider,
      version: 'test',
      hostname_patterns: ['fixture.test'],
      selectors: {},
      is_active: false,
    };

    const trigger = async () => {
      document.querySelector('video')?.dispatchEvent(new Event('play'));
      await vi.advanceTimersByTimeAsync(3500);
    };

    new Wavelet(config).initialize();
    await trigger();
    expect(runtime.sendMessage).not.toHaveBeenCalled();

    new Wavelet({ ...config, is_active: true }).initialize();
    await trigger();
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: message, data: expect.objectContaining({ page_url: location.href }) }),
    );
  });

  it.each([
    { Wavelet: InstagramWavelet, provider: 'instagram', event: 'scroll' },
    { Wavelet: YouTubeWatchWavelet, provider: 'youtube_watch', event: 'yt-navigate-finish' },
  ])('$provider does not register its custom listener when disabled', ({ Wavelet, provider, event }) => {
    const config: SelectorConfig = {
      family: 'social',
      provider,
      version: 'test',
      hostname_patterns: ['fixture.test'],
      selectors: {},
      is_active: false,
    };
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => {});

    new Wavelet(config).initialize();
    expect(listen.mock.calls.some(([name]) => name === event)).toBe(false);

    new Wavelet({ ...config, is_active: true }).initialize();
    expect(listen.mock.calls.some(([name]) => name === event)).toBe(true);
  });
});
