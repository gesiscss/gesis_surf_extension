import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { DB_CONFIG } from '../../constants/dbConfig';
import type { SelectorConfig } from '../../interfaces/types';
import DatabaseService from '../DatabaseService';

const selector: SelectorConfig = {
  family: 'llm',
  provider: 'chatgpt',
  version: '1',
  hostname_patterns: ['chatgpt.com'],
  selectors: { root: ['main'] },
  is_active: true,
};

afterEach(async () => {
  await deleteDB(DB_CONFIG.name);
});

describe('IndexedDB migration', () => {
  it('creates selector and visit stores on a fresh install', async () => {
    const service = new DatabaseService();
    const db = await service['db'];
    const tx = db.transaction(['domainvisits', 'domainslives', 'selectors']);
    expect(tx.objectStore('domainvisits').keyPath).toBe('local_key');
    expect(tx.objectStore('domainslives').keyPath).toBe('local_key');
    expect(tx.objectStore('selectors').keyPath).toBe('provider');
    await tx.done;
    db.close();
  });

  it.each([1, 2, 3, 4])('repairs v%i without selectors and preserves visit data', async version => {
    const legacy = await openDB(DB_CONFIG.name, version, {
      upgrade(db) {
        db.createObjectStore('winlives', { keyPath: 'window_session_id' });
        db.createObjectStore('tabslives', { keyPath: 'tab_session_id' });
        db.createObjectStore('domainslives', { keyPath: version === 4 ? 'local_key' : 'domain_session_id' });
        if (version >= 3) db.createObjectStore('hostslives', { keyPath: 'hostname' });
        if (version === 4) db.createObjectStore('domainvisits', { keyPath: 'local_key' });
      },
    });
    const startTime = '2026-11-10T12:00:00.000Z';
    const key = 'session-tabId-5-domain-https://example.com/';
    const domain = { id: 'existing-uuid', domain_session_id: `${key}#${startTime}`, start_time: startTime };
    const pending = { local_key: 'pending-key', start_time: startTime };
    const window = { window_session_id: 'existing-window', id: 'window-uuid' };
    await legacy.put('winlives', window);
    await legacy.put('domainslives', version === 4 ? { ...domain, local_key: key } : domain);
    if (version === 4) await legacy.put('domainvisits', pending);
    legacy.close();

    const db = await new DatabaseService()['db'];
    try {
      expect(await db.get('winlives', window.window_session_id)).toEqual(window);
      expect(await db.get('domainslives', key)).toEqual({ ...domain, local_key: key });
      if (version === 4) expect(await db.get('domainvisits', pending.local_key)).toEqual(pending);
      await db.put('selectors', selector);
      expect(await db.get('selectors', selector.provider)).toEqual(selector);
    } finally {
      db.close();
    }
  });

  it('preserves selectors already cached by a v4 profile', async () => {
    const legacy = await openDB(DB_CONFIG.name, 4, {
      upgrade(db) {
        db.createObjectStore('domainslives', { keyPath: 'local_key' });
        db.createObjectStore('selectors', { keyPath: 'provider' });
      },
    });
    await legacy.put('selectors', selector);
    legacy.close();

    const service = new DatabaseService();
    const db = await service['db'];
    try {
      expect(await service.getItem('selectors', selector.provider)).toEqual(selector);
    } finally {
      db.close();
    }
  });

  it('upgrades version 3 without losing UUIDs or truncating bare fragments', async () => {
    const legacy = await openDB(DB_CONFIG.name, 3, {
      upgrade(db) {
        db.createObjectStore('winlives', { keyPath: 'window_session_id' });
        db.createObjectStore('domainslives', { keyPath: 'domain_session_id' });
      },
    });
    const time = '2026-11-10T12:00:00.000Z';
    const bare = 'session-tabId-5-domain-https://example.com/#section';
    const composite = `session-tabId-7-domain-https://example.com/#section#${time}`;
    await legacy.put('domainslives', { id: 'legacy-uuid', domain_session_id: bare, start_time: time });
    await legacy.put('domainslives', { id: 'new-uuid', domain_session_id: composite, start_time: time });
    legacy.close();

    const service = new DatabaseService();
    expect(await service.getItem('domainslives', bare)).toMatchObject({
      id: 'legacy-uuid',
      local_key: bare,
      domain_session_id: bare,
    });
    expect(await service.getItem('domainslives', composite.slice(0, composite.lastIndexOf('#')))).toMatchObject({
      id: 'new-uuid',
      domain_session_id: composite,
    });
    expect(await service.count('domainslives')).toBe(2);
    expect(await service.count('domainvisits')).toBe(0);
    (await service['db']).close();
  });

  it('aborts rather than silently discarding records whose local keys collide', async () => {
    const legacy = await openDB(DB_CONFIG.name, 3, {
      upgrade(db) {
        db.createObjectStore('winlives', { keyPath: 'window_session_id' });
        db.createObjectStore('domainslives', { keyPath: 'domain_session_id' });
      },
    });
    for (const time of ['2026-11-10T12:00:00.000Z', '2026-11-10T13:00:00.000Z']) {
      await legacy.put('domainslives', { id: time, domain_session_id: `same-key#${time}` });
    }
    legacy.close();
    const log = vi.spyOn(console, 'error');
    const service = new DatabaseService();
    await expect(service['db']).rejects.toThrow();
    expect(log).toHaveBeenCalled();
    const unchanged = await openDB(DB_CONFIG.name);
    expect(unchanged.version).toBe(3);
    expect(await unchanged.count('domainslives')).toBe(2);
    unchanged.close();
  });
});
