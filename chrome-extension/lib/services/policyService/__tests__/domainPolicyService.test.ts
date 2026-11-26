import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '@root/lib/db';
import { storage } from 'webextension-polyfill';
import { DomainPolicyService } from '../domainPolicyService';

vi.mock('idb', () => ({ openDB: vi.fn().mockResolvedValue({}) }));

describe('DomainPolicyService', () => {
  let databaseService: DatabaseService;
  let service: DomainPolicyService;

  beforeEach(() => {
    vi.mocked(storage.local.get).mockResolvedValue({ private: { mode: false } });
    databaseService = new DatabaseService();
    vi.spyOn(databaseService, 'getItem').mockResolvedValue(null);
    service = new DomainPolicyService(databaseService);
  });

  it('sanitizes title, URL, and favicon in the evaluated payload', async () => {
    const invalidText = 'page\u0000\uD800🍪';
    const payload = await service.evaluate('https://example.com', {
      id: 1,
      url: `https://example.com/${invalidText}`,
      title: invalidText,
      favIconUrl: `https://example.com/${invalidText}.png`,
      lastAccessed: Date.now(),
      status: 'complete',
      windowId: 1,
    });

    expect(payload.domain_title).toBe('page\uFFFD🍪');
    expect(payload.domain_url).toBe('https://example.com/page\uFFFD🍪');
    expect(payload.domain_fav_icon).toBe('https://example.com/page\uFFFD🍪.png');
  });
});
