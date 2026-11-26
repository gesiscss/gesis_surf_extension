import { describe, expect, it, vi } from 'vitest';
import TabHandler from '../TabHandler';
import { apiRequestWithDevice } from '../../../services/apiClientWithDevice';

vi.mock('@root/lib/db', () => ({
  DatabaseService: class {
    async getItem() {
      return null;
    }
    async deleteItem() {}
  },
}));
vi.mock('@root/lib/services', () => ({ GlobalSessionService: class {} }));
vi.mock('../DomainHandler', () => ({ default: class {} }));
vi.mock('../../../services/apiClientWithDevice', () => ({
  apiRequestWithDevice: vi.fn(async () => new Response('{}', { status: 200 })),
}));

describe('TabHandler.updateTab', () => {
  it('sends the closing time under the field name the backend expects', async () => {
    const handler = new TabHandler();
    const startTime = '2026-01-01T00:00:00.000Z';

    await handler.updateTab(
      7,
      {
        id: 7,
        start_time: startTime,
        closing_time: startTime,
        window_num: 1,
        window: 3,
        tab_num: 7,
        tab_session_id: 'session-tabId-7',
        user: 'user',
        domains: [],
      },
      'PATCH',
      'domain-session',
    );

    const [, init] = vi.mocked(apiRequestWithDevice).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.closing_time).not.toBe(startTime);
    expect(body).not.toHaveProperty('close_time');
  });
});
