import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { DB_CONFIG } from '../../constants/dbConfig';
import DatabaseService from '../DatabaseService';

afterEach(async () => {
  await deleteDB(DB_CONFIG.name);
});

describe('Domain identity database migration', () => {
  it('creates local-key and pending-identity stores on a fresh install', async () => {
    const service = new DatabaseService();
    expect(await service.count('domainvisits')).toBe(0);
    const db = await openDB(DB_CONFIG.name);
    const tx = db.transaction(['domainvisits', 'domainslives']);
    expect(tx.objectStore('domainvisits').keyPath).toBe('local_key');
    expect(tx.objectStore('domainslives').keyPath).toBe('local_key');
    await tx.done;
    db.close();
    (await service['db']).close();
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
