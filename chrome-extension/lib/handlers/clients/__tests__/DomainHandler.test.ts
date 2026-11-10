import { beforeEach, describe, expect, it, vi } from 'vitest';
import DomainHandler, { VISIT_TIME_SEPARATOR } from '../DomainHandler';
import { apiRequestWithDevice } from '../../../services/apiClientWithDevice';

const memory = vi.hoisted(() => new Map<string, { local_key: string; domain_session_id: string }>());
vi.mock('@root/lib/db', () => ({
  DatabaseService: class {
    async getItem(table: string, key: string) {
      return memory.get(`${table}:${key}`) ?? null;
    }
    async setItem(table: string, entry: { local_key: string; domain_session_id: string }) {
      memory.set(`${table}:${entry.local_key}`, entry);
    }
    async deleteItem(table: string, key: string) {
      memory.delete(`${table}:${key}`);
    }
  },
}));
vi.mock('@root/lib/services', () => ({
  GlobalSessionService: class {
    async getGlobalSessionId() {
      return 'global-session';
    }
  },
}));
vi.mock('@root/lib/services/policyService', () => ({
  DomainPolicyService: class {
    async evaluate(_url: string, domain: { url: string; title: string; favIconUrl: string; lastAccessed: number }) {
      return {
        domain_title: domain.title,
        domain_url: domain.url,
        domain_fav_icon: domain.favIconUrl,
        start_time: '2026-01-01T00:00:00.000Z',
        closing_time: '2026-01-01T00:00:00.000Z',
        criteria_classification: 'default',
      };
    }
  },
}));
vi.mock('@root/lib/services/apiClientWithDevice', () => ({ apiRequestWithDevice: vi.fn() }));

describe('DomainHandler', () => {
  beforeEach(() => {
    DomainHandler.clearVisitRegistryForTests();
    memory.clear();
  });

  it('sanitizes URLs in domain session IDs consistently', async () => {
    const handler = new DomainHandler();
    const url = 'https://example.com/page\u0000\uD800🍪';

    await expect(handler.generateDomainSession(1, 2, url)).resolves.toBe(
      'global-session-tabId-2-domain-https://example.com/page\uFFFD🍪',
    );
    await expect(handler.generateDomainSession(1, 2, url, 'Private-Mode')).resolves.toBe(
      'global-session-tabId-2-domain-Private-Mode',
    );
  });

  it('mints the visit time once per visit and reuses it for the same open visit', async () => {
    const handler = new DomainHandler();
    const key = 'global-session-tabId-2-domain-https://example.com';

    const [first, second] = await Promise.all([handler.mintVisitStart(key), handler.mintVisitStart(key)]);

    expect(second).toBe(first);
    expect(await handler.wireSessionId(key)).toBe(`${key}${VISIT_TIME_SEPARATOR}${first}`);
  });

  it('mints a new visit time after the visit is closed', async () => {
    const handler = new DomainHandler();
    const key = 'global-session-tabId-2-domain-https://example.com';

    const first = await handler.mintVisitStart(key);
    expect(await handler.wireSessionId(key)).toBe(`${key}${VISIT_TIME_SEPARATOR}${first}`);

    await handler.cancelPendingDomain(key);
    expect(handler.currentVisitStart(key)).toBeUndefined();

    // A new registration after the close is an independent visit.
    await handler.registerPendingDomain(key);
    expect(handler.currentVisitStart(key)).toBeDefined();
    expect(await handler.wireSessionId(key)).toBe(`${key}${VISIT_TIME_SEPARATOR}${handler.currentVisitStart(key)}`);
  });

  it('returns no hint without an established visit', async () => {
    const handler = new DomainHandler();
    expect(await handler.wireSessionId('global-session-tabId-2-domain-https://example.com')).toBe('');
  });

  // ---------------------------------------------------------------
  // sendDomain: exact created_domains matching (B5 contract)
  // ---------------------------------------------------------------

  const domainRow = (id: number, sessionId: string, startTime: string) => ({
    id,
    user: 1,
    start_time: startTime,
    closing_time: startTime,
    domain_title: 'Example',
    domain_fav_icon: '',
    domain_last_accessed: startTime,
    domain_session_id: sessionId,
    domain_url: 'https://example.com',
  });

  const tabMapping = { id: '42' } as never;

  const setupSend = (response: unknown) => {
    const store = new Map<string, unknown>();
    vi.mocked(apiRequestWithDevice).mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const handler = new DomainHandler();
    const db = {
      getItem: vi.fn(async (table: string, key: string) =>
        table === 'domainslives' ? (store.get(key) ?? null) : null,
      ),
      setItem: vi.fn(async (table: string, entry: { local_key: string }) => {
        if (table === 'domainslives') store.set(entry.local_key, entry);
      }),
      deleteItem: vi.fn(async (_table: string, key: string) => {
        store.delete(key);
      }),
    };
    (handler as unknown as { dbService: unknown }).dbService = db;
    return { handler, store, db };
  };

  const domainData = {
    id: 2,
    favIconUrl: '',
    url: 'https://example.com',
    title: 'Example',
    lastAccessed: 0,
    windowId: 1,
    status: 'complete',
  };

  it('stores the exact created_domains row matching the requested hint, not the newest history row', async () => {
    const stableKey = 'global-session-tabId-2-domain-https://example.com';
    const visitStart = '2026-01-01T00:00:00.000Z';
    const wireHint = `${stableKey}${VISIT_TIME_SEPARATOR}${visitStart}`;

    // Older revisit A1 (newer start_time is irrelevant — history must not win)
    const oldVisit = domainRow(
      101,
      `${stableKey}${VISIT_TIME_SEPARATOR}2025-12-31T23:00:00.000Z`,
      '2025-12-31T23:00:00.000Z',
    );
    const exactVisit = domainRow(102, wireHint, visitStart);

    const { handler, store } = setupSend({
      domains: [oldVisit, exactVisit],
      created_domains: [exactVisit],
    });

    await handler.mintVisitStart(stableKey);
    const domainDataWithMintedTime = { ...domainData };
    // Ensure the minted time equals the hint's visit time for this test.
    DomainHandler['visitStarts'].set(stableKey, visitStart);

    const returned = await handler.sendDomain(domainDataWithMintedTime, tabMapping, 'PATCH');

    expect(returned).toBe(stableKey);
    const stored = store.get(stableKey) as { id: number; domain_session_id: string };
    expect(stored).toBeDefined();
    expect(stored.id).toBe(102);
    expect(stored.domain_session_id).toBe(wireHint);
  });

  it('reports a mismatch instead of storing a wrong visit from the full history', async () => {
    const stableKey = 'global-session-tabId-2-domain-https://example.com';
    const visitStart = '2026-01-01T00:00:00.000Z';
    const wrongVisit = domainRow(
      101,
      `${stableKey}${VISIT_TIME_SEPARATOR}2025-12-31T23:00:00.000Z`,
      '2025-12-31T23:00:00.000Z',
    );

    const { handler, store } = setupSend({
      domains: [wrongVisit],
      created_domains: [wrongVisit], // backend did not create the requested visit
    });

    await handler.mintVisitStart(stableKey);
    DomainHandler['visitStarts'].set(stableKey, visitStart);

    const returned = await handler.sendDomain(domainData, tabMapping, 'PATCH');

    expect(returned).toBeUndefined();
    expect(store.size).toBe(0); // nothing silently stored
  });

  it('reports a missing created_domains list instead of falling back to newest-history guessing', async () => {
    const stableKey = 'global-session-tabId-2-domain-https://example.com';
    const visitStart = '2026-01-01T00:00:00.000Z';

    // Old backend shape: only domains history, no B5 list
    const { handler, store } = setupSend({
      domains: [domainRow(101, stableKey, '2025-12-31T23:00:00.000Z')],
    });

    await handler.mintVisitStart(stableKey);
    DomainHandler['visitStarts'].set(stableKey, visitStart);

    const returned = await handler.sendDomain(domainData, tabMapping, 'PATCH');

    expect(returned).toBeUndefined();
    expect(store.size).toBe(0);
  });
});
