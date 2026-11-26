// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { TwitchFeedWavelet } from '../TwitchFeedWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.twitch.tv');

function card(viewers = '1.2K viewers'): HTMLElement {
  return fixture(`<div data-test-selector="shelf-card-selector">
    <div data-test-selector="StreamTitle"><h4>Fixture stream</h4></div>
    <a data-test-selector="TitleAndChannel" href="/alice" aria-label="Alice (Verified)"></a>
    <a data-a-target="preview-card-channel-link"><p title="Alice"></p></a>
    <a data-test-selector="GameLink">Science</a><div class="tw-media-card-stat">${viewers}</div>
    <span class="tw-tag">English</span><span class="tw-tag"></span>
    <span class="tw-channel-status-text-indicator">LIVE</span></div>`);
}

describe('Twitch directory cards', () => {
  it.each([
    ['1.2K viewers', 1200],
    ['1,234 viewers', 1234],
    ['offline', 0],
  ])('captures stream metadata with %s', (viewers, count) => {
    expect(new TwitchFeedWavelet().extractPost(card(viewers))).toMatchObject({
      id: 'alice',
      platform: 'twitch',
      signal_type: 'feed',
      author_handle: 'alice',
      author_display_name: 'Alice',
      content_text: 'Fixture stream',
      viewer_count: count,
      views: count,
      is_live: true,
      is_verified: true,
      game_name: 'Science',
      tags: ['English'],
      permalink: 'https://www.twitch.tv/alice',
    });
  });

  it('rejects unidentified cards and supports sparse identified cards', () => {
    const wavelet = new TwitchFeedWavelet();
    expect(wavelet.extractPost(fixture('<div></div>'))).toBeNull();
    expect(
      wavelet.extractPost(fixture('<div><a data-test-selector="TitleAndChannel" href="/bob"></a></div>')),
    ).toMatchObject({ id: 'bob', author_display_name: 'bob', viewer_count: 0, is_live: false, tags: [] });
  });

  it('captures directory cards once per instance and again on later visits', async () => {
    card();
    new TwitchFeedWavelet().initialize();
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'TWITCH_FEED', data: expect.objectContaining({ id: 'alice' }) }),
    );
    new TwitchFeedWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
});
