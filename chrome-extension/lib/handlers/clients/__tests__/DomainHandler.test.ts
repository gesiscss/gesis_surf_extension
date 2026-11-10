import { beforeEach, describe, expect, it, vi } from 'vitest';
import DomainHandler, { VISIT_TIME_SEPARATOR } from '../DomainHandler';
import { apiRequestWithDevice } from '../../../services/apiClientWithDevice';

vi.mock('@root/lib/db', () => ({ DatabaseService: class {} }));
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

  it('mints the visit time once per visit and reuses it for the same open visit', () => {
    const handler = new DomainHandler();
    const key = 'global-session-tabId-2-domain-https://example.com';

    const first = handler.mintVisitStart(key);
    const second = handler.mintVisitStart(key);

    expect(second).toBe(first);
    expect(handler.wireSessionId(key)).toBe(`${key}${VISIT_TIME_SEPARATOR}${first}`);
  });

  it('mints a new visit time after the visit is closed', () => {
    const handler = new DomainHandler();
    const key = 'global-session-tabId-2-domain-https://example.com';

    const first = handler.mintVisitStart(key);
    expect(handler.wireSessionId(key)).toBe(`${key}${VISIT_TIME_SEPARATOR}${first}`);

    handler.cancelPendingDomain(key);
    expect(handler.currentVisitStart(key)).toBeUndefined();

    // A new registration after the close is an independent visit.
    handler.registerPendingDomain(key);
    expect(handler.currentVisitStart(key)).toBeDefined();
    expect(handler.wireSessionId(key)).toBe(`${key}${VISIT_TIME_SEPARATOR}${handler.currentVisitStart(key)}`);
  });

  it('falls back to the bare key when no visit is open', () => {
    const handler = new DomainHandler();
    expect(handler.wireSessionId('global-session-tabId-2-domain-https://example.com')).toBe(
      'global-session-tabId-2-domain-https://example.com',
    );
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
      getItem: vi.fn(async (_table: string, key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (_table: string, entry: { domain_session_id: string }) => {
        store.set(entry.domain_session_id, entry);
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

    handler.mintVisitStart(stableKey);
    const domainDataWithMintedTime = { ...domainData };
    // Ensure the minted time equals the hint's visit time for this test.
    DomainHandler['visitStarts'].set(stableKey, visitStart);

    const returned = await handler.sendDomain(domainDataWithMintedTime, tabMapping, 'PATCH');

    expect(returned).toBe(wireHint);
    const stored = store.get(stableKey) as { id: number; domain_session_id: string };
    expect(stored).toBeDefined();
    expect(stored.id).toBe(102);
    expect(stored.domain_session_id).toBe(stableKey); // stored under the stable key
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

    handler.mintVisitStart(stableKey);
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

    handler.mintVisitStart(stableKey);
    DomainHandler['visitStarts'].set(stableKey, visitStart);

    const returned = await handler.sendDomain(domainData, tabMapping, 'PATCH');

    expect(returned).toBeUndefined();
    expect(store.size).toBe(0);
  });
});
