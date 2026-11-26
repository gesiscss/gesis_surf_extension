// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { ThreadsFeedWavelet } from '../ThreadsFeedWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.threads.net');

function post(extra = ''): HTMLElement {
  return fixture(`<div data-pressable-container="true"><a href="/@alice"><span>Alice</span></a>
    <a href="https://www.threads.net/@alice/post/ABC">Post</a>
    <p>A longer post body</p><time datetime="2026-01-01T12:00:00Z"></time>${extra}</div>`);
}

describe('Threads feed', () => {
  it('extracts content while excluding engagement labels and parses scaled counts', () => {
    const element = post(`<svg aria-label="Verified"></svg><div role="group">
      <span>This action label is not the post content even though it is longer</span>
      <button><svg aria-label="Like"></svg><span>16.9K</span></button>
      <button><svg aria-label="Comment"></svg><span>1.2M</span></button>
      <button><svg aria-label="Repost"></svg><span>2.3B</span></button>
      <button><svg aria-label="Reply"></svg><span>12</span></button></div>`);
    expect(new ThreadsFeedWavelet().extractPost(element)).toMatchObject({
      id: 'ABC',
      platform: 'threads',
      signal_type: 'feed',
      author_handle: 'alice',
      author_display_name: 'Alice',
      content_text: 'A longer post body',
      is_verified: true,
      likes: 16900,
      comments: 1200000,
      reposts: 2300000000,
      replies: 12,
      post_timestamp: '2026-01-01T12:00:00Z',
      is_ad: false,
    });
  });

  it('uses direct text when spans and paragraphs are absent and detects ads', () => {
    const root = fixture(`<div>Sponsored direct body<a href="/@alice">Alice</a>
      <a href="https://www.threads.net/@alice/post/ABC">Post</a>
      <button><svg aria-label="Like"></svg></button></div>`);
    expect(new ThreadsFeedWavelet().extractPost(root)).toMatchObject({
      content_text: 'Sponsored direct body',
      is_ad: true,
      author_display_name: 'Alice',
      likes: 0,
    });
  });

  it('rejects elements without a post permalink', () => {
    expect(new ThreadsFeedWavelet().extractPost(fixture('<div><a href="/@alice">Alice</a></div>'))).toBeNull();
  });

  it('ignores incomplete cards and deduplicates rescans without blocking later visits', async () => {
    const element = post();
    const incomplete = document.createElement('div');
    incomplete.setAttribute('data-pressable-container', 'true');
    incomplete.innerHTML = '<a href="/@bob">Bob</a>';
    document.body.append(incomplete);
    new ThreadsFeedWavelet().initialize();
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'THREADS_POST', data: expect.objectContaining({ id: 'ABC' }) }),
    );
    element.setAttribute('data-testid', 'rendered');
    await Promise.resolve();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    new ThreadsFeedWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
});
