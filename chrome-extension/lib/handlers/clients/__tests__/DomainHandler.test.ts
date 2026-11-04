import { describe, expect, it, vi } from 'vitest';
import DomainHandler from '../DomainHandler';

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
});
