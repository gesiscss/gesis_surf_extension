// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { YouTubeWatchWavelet } from '../YouTubeWatchWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.youtube.com');

function navigate(id = 'fixture1234'): void {
  Object.assign(location, { pathname: '/watch', search: `?v=${id}`, href: `https://www.youtube.com/watch?v=${id}` });
}

function watchPage(views = '1.2M views'): HTMLElement {
  navigate();
  return fixture(`<ytd-watch-flexy>
    <ytd-watch-metadata><h1><yt-formatted-string>Fixture video</yt-formatted-string></h1></ytd-watch-metadata>
    <ytd-channel-name><a href="/@alice"><span id="text">Alice</span></a></ytd-channel-name>
    <ytd-watch-info-text><span id="info">${views}</span>
      <span id="date-text"><yt-formatted-string>Jan 1, 2026</yt-formatted-string></span></ytd-watch-info-text>
    <like-button-view-model><button aria-label="like this video along with 1,234 other people"></button></like-button-view-model>
    <ytd-text-inline-expander><span id="snippet-text">Description</span></ytd-text-inline-expander>
    </ytd-watch-flexy>`);
}

describe('YouTube watch capture', () => {
  it('captures watch metadata, including lazy comments outside the watch container', () => {
    const root = watchPage();
    const comments = document.createElement('ytd-comments-header-renderer');
    comments.innerHTML = '<div id="count"><yt-formatted-string>1.2K Comments</yt-formatted-string></div>';
    document.body.append(comments);
    expect(new YouTubeWatchWavelet().extractPost(root)).toMatchObject({
      id: 'fixture1234',
      signal_type: 'played',
      author_handle: 'alice',
      author_display_name: 'Alice',
      content_text: 'Fixture video',
      views: 1200000,
      likes: 1234,
      comments: 1200,
      post_timestamp: new Date('Jan 1, 2026').toISOString(),
    });
  });

  it.each([
    ['2K views', 2000],
    ['3B views', 3000000000],
    ['1,234 views', 1234],
  ])('parses %s', (text, views) => {
    expect(new YouTubeWatchWavelet().extractPost(watchPage(text))?.views).toBe(views);
  });

  it('uses configured candidates after invalid or empty selectors', () => {
    const root = watchPage();
    const config: SelectorConfig = {
      family: 'social',
      provider: 'youtube_watch',
      version: 'test',
      hostname_patterns: ['youtube.com'],
      is_active: true,
      selectors: { view_count: ['[', '.missing', '#info'], comments_header: ['[', '.missing', '.comments'] },
    };
    const header = document.createElement('div');
    header.className = 'comments';
    header.setAttribute('aria-label', '2M comments');
    document.body.append(header);
    expect(new YouTubeWatchWavelet(config).extractPost(root)).toMatchObject({ views: 1200000, comments: 2000000 });
  });

  it('waits for views until retry exhaustion, then permits a sparse snapshot', () => {
    const root = watchPage('not rendered');
    const wavelet = new YouTubeWatchWavelet();
    expect(wavelet.extractPost(root)).toBeNull();
    expect(wavelet.extractPost(root, 5, 5)).toMatchObject({ views: 0, comments: 0 });
    location.search = '';
    expect(wavelet.extractPost(root, 5, 5)).toBeNull();
  });

  it('retries missing containers and metadata, then captures once on the current visit', async () => {
    navigate();
    new YouTubeWatchWavelet().initialize();
    await vi.advanceTimersByTimeAsync(600);
    const root = watchPage('loading');
    await vi.advanceTimersByTimeAsync(600);
    const info = root.querySelector('#info');
    if (!info) throw new Error('Missing fixture views');
    info.textContent = '100 views';
    await vi.advanceTimersByTimeAsync(600);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'YOUTUBE_WATCH',
        data: expect.objectContaining({ id: 'fixture1234', views: 100 }),
      }),
    );
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(600);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    navigate('nextVideo12');
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(600);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'nextVideo12' }) }),
    );
  });

  it('waits for DOM readiness and allows a new instance to capture a later visit', async () => {
    watchPage();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    new YouTubeWatchWavelet().initialize();
    await vi.advanceTimersByTimeAsync(600);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(600);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    new YouTubeWatchWavelet().initialize();
    await vi.advanceTimersByTimeAsync(600);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('ignores non-watch pages and stops retrying when the container never appears', async () => {
    Object.assign(location, { pathname: '/feed', search: '' });
    new YouTubeWatchWavelet().initialize();
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    navigate();
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(warn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
});
