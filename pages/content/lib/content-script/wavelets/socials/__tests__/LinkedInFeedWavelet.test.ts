// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { runtime } from 'webextension-polyfill';
import { LinkedInFeedWavelet } from '../LinkedInFeedWavelet';
import { fixture, setupDOM } from './fixtures';

vi.mock('webextension-polyfill', () => ({
  runtime: { sendMessage: vi.fn(async () => ({ status: 'success' })) },
}));
setupDOM('www.linkedin.com');

function article(text = '2h', extra = '', visibility = 'Visibility: Global'): HTMLElement {
  const root = fixture(`<div role="listitem">
    <a href="https://www.linkedin.com/in/alice/">Alice</a>
    <a href="https://www.linkedin.com/feed/update/urn:li:activity:1234567890123">Post</a>
    <div data-testid="expandable-text-box">A useful update</div>
    <svg id="globe-americas-small" aria-label="${visibility}"></svg>
    <button aria-label="Reaction button state">12</button><button aria-label="Comment">3</button>
    <button aria-label="Repost">2</button>${extra}</div>`);
  // jsdom does not implement layout-derived innerText.
  Object.defineProperty(root, 'innerText', { value: text, configurable: true });
  return root;
}

describe('LinkedIn extraction', () => {
  it('captures a public post with metadata and engagement', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    expect(new LinkedInFeedWavelet().extractPost(article())).toMatchObject({
      id: 'linkedin_activity_1234567890123',
      platform: 'linkedin',
      signal_type: 'feed',
      author_handle: 'alice',
      author_display_name: 'Alice',
      content_text: 'A useful update',
      is_public: true,
      visibility: 'Global',
      likes: 12,
      comments: 3,
      reposts: 2,
      post_timestamp: '2026-01-15T10:00:00.000Z',
      feed_context_type: 'person_post',
    });
  });

  it.each([
    ['Bob likes this', 'liked_by_connection', 'Bob'],
    ['Bob findet das lustig', 'reacted_by_connection', 'Bob'],
    ['Bob finds this interesting', 'reacted_by_connection', 'Bob'],
    ['Promoted', 'promoted_post', undefined],
    ['Vorgeschlagen', 'suggested_post', undefined],
  ])('classifies feed context: %s', (text, type, actor) => {
    expect(new LinkedInFeedWavelet().extractPost(article(text))).toMatchObject({
      feed_context_type: type,
      feed_context_actor: actor,
    });
  });

  it('redacts private post identity, content and connection actor', () => {
    expect(new LinkedInFeedWavelet().extractPost(article('Bob likes this', '', 'Connections'))).toMatchObject({
      is_public: false,
      author_handle: '[private]',
      author_display_name: '[private]',
      content_text: '[private]',
      feed_context_actor: '[private]',
    });
  });

  it.each(['Promoted', 'Suggested'])('retains marketing content without a public icon: %s', text => {
    expect(new LinkedInFeedWavelet().extractPost(article(text, '', ''))).toMatchObject({
      is_public: false,
      author_handle: 'alice',
      content_text: 'A useful update',
      is_ad: text === 'Promoted',
    });
  });

  it('selects the final profile as group author and extracts group context', () => {
    expect(
      new LinkedInFeedWavelet().extractPost(
        article(
          '',
          `
      <a href="https://www.linkedin.com/groups/42">Example group</a>
      <a href="https://www.linkedin.com/in/carol/">Carol</a>`,
        ),
      ),
    ).toMatchObject({
      author_handle: 'carol',
      group_name: 'Example group',
      feed_context_type: 'group_post',
    });
  });

  it.each([
    ['<img alt="View image">', 'image'],
    ['<a target="_blank" href="https://fixture.test/news">Read</a>', 'external_link'],
  ])('classifies media %s', (extra, type) => {
    expect(new LinkedInFeedWavelet().extractPost(article('', extra))?.post_type).toBe(type);
  });

  it.each(['1m', '1d', '1w', '1mo', '1yr'])('parses relative timestamps: %s', text => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    const date = new Date();
    const expected: Record<string, () => void> = {
      '1m': () => date.setMinutes(date.getMinutes() - 1),
      '1d': () => date.setDate(date.getDate() - 1),
      '1w': () => date.setDate(date.getDate() - 7),
      '1mo': () => date.setMonth(date.getMonth() - 1),
      '1yr': () => date.setFullYear(date.getFullYear() - 1),
    };
    expected[text]();
    expect(new LinkedInFeedWavelet().extractPost(article(text))?.post_timestamp).toBe(date.toISOString());
  });

  it('derives encoded activity IDs and stable fallback IDs', () => {
    const wavelet = new LinkedInFeedWavelet();
    const post = article();
    const link = post.querySelector('a[href*="activity"]');
    link?.setAttribute('href', 'https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A1234567890123');
    expect(wavelet.extractPost(post)?.id).toBe('linkedin_activity_1234567890123');
    link?.remove();
    const result = wavelet.extractPost(post);
    expect(result?.id).toMatch(/^linkedin_fallback_/);
    expect(wavelet.extractPost(post)?.id).toBe(result?.id);
    expect(result?.permalink).toBe(location.href);
  });

  it('ignores recommendation widgets and non-posts while deduplicating repeated scans', async () => {
    const widget = article('Suggested to follow');
    new LinkedInFeedWavelet().initialize();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    Object.defineProperty(widget, 'innerText', { value: 'A real post' });
    const empty = document.createElement('div');
    empty.setAttribute('role', 'listitem');
    document.body.append(empty);
    await vi.advanceTimersByTimeAsync(8000);
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'LINKEDIN_POST', data: expect.objectContaining({ author_handle: 'alice' }) }),
    );
    new LinkedInFeedWavelet().initialize();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
});
