import { describe, expect, it, vi } from 'vitest';
import { apiRequestWithDevice } from '@root/lib/services/apiClientWithDevice';
import ContentScriptHandler from '../ContentScriptHandler';

vi.mock('@root/lib/services/apiClientWithDevice', () => ({ apiRequestWithDevice: vi.fn() }));

describe('ContentScriptHandler', () => {
  it('sanitizes HTML snapshot and metadata before sending', async () => {
    vi.mocked(apiRequestWithDevice).mockResolvedValue(new Response('{}'));
    const handler = new ContentScriptHandler('https://api.example.com');

    await handler.sendHTML(
      {
        html_content: '<p>page\u0000\uD800🍪</p>',
        meta: {
          title: 'title\u0000\uD800',
          description: 'description\uD800',
          favicon_url: 'icon\u0000🍪',
        },
      },
      { id: 'domain-id', domain: 'example.com', created_at: '2026-01-01T00:00:00Z' },
    );

    expect(apiRequestWithDevice).toHaveBeenCalledWith(
      'https://api.example.com/domain/domains/domain-id/',
      {
        method: 'PATCH',
        body: JSON.stringify({
          snapshot_html: '<p>page\uFFFD🍪</p>',
          meta: {
            title: 'title\uFFFD',
            description: 'description\uFFFD',
            favicon_url: 'icon🍪',
          },
        }),
      },
      { method: 'PATCH' },
    );
  });
});
