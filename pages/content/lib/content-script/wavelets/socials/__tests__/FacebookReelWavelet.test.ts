// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { FacebookReelWavelet } from '../FacebookReelWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.facebook.com');

describe('Facebook reel cards', () => {
  it.each(['from', 'de', 'von', 'di', 'da', 'van'])('parses localized author prefix %s', prefix => {
    const reel =
      fixture(`<a href="https://www.facebook.com/reel/123?tracking=1" aria-label="Reel ${prefix} Alice & Bob">
      <img src="https://fixture.fbcdn.test/thumbnail"></a>`);
    expect(new FacebookReelWavelet().extractPost(reel)).toMatchObject({
      id: '123',
      signal_type: 'reel',
      author_display_name: 'Alice & Bob',
      author_handle: 'alice.bob',
      permalink: 'https://www.facebook.com/reel/123',
      thumbnail_url: 'https://fixture.fbcdn.test/thumbnail',
      is_public: true,
    });
  });

  it('uses an ID-based handle for missing author names and rejects non-reels', () => {
    const wavelet = new FacebookReelWavelet();
    expect(wavelet.extractPost(fixture('<a href="https://www.facebook.com/reel/123"></a>'))).toMatchObject({
      author_handle: 'reel_123',
      author_display_name: '',
      thumbnail_url: '',
    });
    expect(wavelet.extractPost(fixture('<a href="https://www.facebook.com/alice">Alice</a>'))).toBeNull();
  });

  it('captures nested and newly inserted cards once per instance', async () => {
    fixture('<section><a href="https://www.facebook.com/reel/123" aria-label="Alice"></a></section>');
    new FacebookReelWavelet().initialize();
    const added = document.createElement('a');
    added.href = 'https://www.facebook.com/reel/456';
    added.setAttribute('aria-label', 'Bob');
    document.body.append(added);
    await vi.advanceTimersByTimeAsync(8000);
    expect(vi.mocked(runtime.sendMessage).mock.calls.map(([message]) => message.data.id)).toEqual(['123', '456']);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'FACEBOOK_REEL' }));
    new FacebookReelWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
  });
});
