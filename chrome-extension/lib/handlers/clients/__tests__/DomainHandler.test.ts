import { beforeEach, describe, expect, it, vi } from 'vitest';
import DomainHandler, { VISIT_TIME_SEPARATOR } from '../DomainHandler';

vi.mock('@root/lib/db', () => ({ DatabaseService: class {} }));
vi.mock('@root/lib/services', () => ({
  GlobalSessionService: class {
    async getGlobalSessionId() {
      return 'global-session';
    }
  },
}));
vi.mock('@root/lib/services/policyService', () => ({ DomainPolicyService: class {} }));
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
});
