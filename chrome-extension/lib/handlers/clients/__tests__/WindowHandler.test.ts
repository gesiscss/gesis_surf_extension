import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_CONFIG } from '@root/lib/db/constants/dbConfig';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  globalSession: { id: 'global-id', global_session_id: 'session', user: 'owner' },
}));

vi.mock('@root/lib/services/globalSession/GlobalSessionService', () => ({
  default: class {
    getGlobalSessionId(windowId: number) {
      return Promise.resolve(`session-windowId-${windowId}`);
    }
    getFromLocalStorage() {
      return Promise.resolve(mocks.globalSession);
    }
  },
}));
vi.mock('@root/lib/services/apiClientWithDevice', () => ({ apiRequestWithDevice: mocks.request }));
vi.mock('@root/lib/handlers', () => ({}));
vi.mock('webextension-polyfill', () => ({
  windows: { get: async (id: number) => ({ id, top: 0 }) },
  alarms: { onAlarm: { addListener: () => undefined } },
}));

import WindowManager from '../WindowHandler';
import WindowEventManager from '@root/lib/events/managers/WindowEventManager';

const row = (id: string) => ({
  id,
  user: 'owner',
  global_session: 'global-id',
  window_num: 1,
  window_session_id: 'session-windowId-1',
  start_time: '2026-11-25T10:00:00.000Z',
  closing_time: '2026-11-25T10:00:00.000Z',
});

const response = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let handler: WindowManager;

beforeEach(() => {
  mocks.request.mockReset();
  mocks.globalSession.user = 'owner';
  handler = new WindowManager();
});

afterEach(async () => {
  (await handler['dbService']['db']).close();
  await deleteDB(DB_CONFIG.name);
});

describe('window close recovery', () => {
  it('creates a new focus row after a failed close and later repairs the old row', async () => {
    const secondWindow = { ...row('window-2'), window_num: 2, window_session_id: 'session-windowId-2' };
    mocks.request
      .mockResolvedValueOnce(response(row('old')))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(secondWindow))
      .mockResolvedValueOnce(response(secondWindow))
      .mockResolvedValueOnce(response(row('new')))
      .mockResolvedValueOnce(response(row('old')));
    const manager = new WindowEventManager(handler);

    await manager['handleBrowserFocusGained'](1);
    await manager['handleBrowserFocusGained'](2);
    await manager['handleBrowserFocusGained'](1);
    expect((await handler['dbService'].getItem('winlives', 'session-windowId-1'))?.id).toBe('new');
    expect(await handler['dbService'].count('windowclosings')).toBe(1);

    await handler.retryPendingClosures();
    expect(mocks.request.mock.calls[5][0]).toContain('/window/windows/old/');
    expect((await handler['dbService'].getItem('winlives', 'session-windowId-1'))?.id).toBe('new');
    expect(await handler['dbService'].count('windowclosings')).toBe(0);
  });

  it('retires a failed close and retries the original row without removing its replacement', async () => {
    mocks.request
      .mockResolvedValueOnce(response(row('old')))
      .mockResolvedValueOnce(response({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(response(row('new')))
      .mockResolvedValueOnce(response(row('old')));
    await handler.sendWindow(1, 'onCreated', 'POST', '2026-11-25T10:00:00.000Z');
    await expect(handler.updateWindow(1, 'onFocusChanged', 'PATCH')).rejects.toThrow('503');
    expect(await handler.hasWindowRecord(1)).toBe(false);

    await handler.sendWindow(1, 'onCreated', 'POST', '2026-11-25T10:01:00.000Z');
    await handler.retryPendingClosures();

    const calls = mocks.request.mock.calls;
    expect(calls[3][0]).toContain('/window/windows/old/');
    expect(JSON.parse(calls[3][1].body).closing_time).toBe(JSON.parse(calls[1][1].body).closing_time);
    expect((await handler['dbService'].getItem('winlives', 'session-windowId-1'))?.id).toBe('new');
    expect(await handler['dbService'].count('windowclosings')).toBe(0);
  });

  it('does not retry another owner’s pending close', async () => {
    mocks.request.mockResolvedValueOnce(response(row('old'))).mockRejectedValueOnce(new Error('offline'));
    await handler.sendWindow(1, 'onCreated', 'POST', '2026-11-25T10:00:00.000Z');
    await expect(handler.updateWindow(1, 'onBlurred', 'PATCH')).rejects.toThrow('offline');
    mocks.globalSession.user = 'different-owner';

    await handler.retryPendingClosures();
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(await handler['dbService'].count('windowclosings')).toBe(1);
  });

  it('keeps a failed retry for the next worker instance', async () => {
    mocks.request
      .mockResolvedValueOnce(response(row('old')))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce(response(row('old')));
    await handler.sendWindow(1, 'onCreated', 'POST', '2026-11-25T10:00:00.000Z');
    await expect(handler.updateWindow(1, 'onBlurred', 'PATCH')).rejects.toThrow('offline');
    await handler.retryPendingClosures();
    expect(await handler['dbService'].count('windowclosings')).toBe(1);

    (await handler['dbService']['db']).close();
    handler = new WindowManager();
    await handler.retryPendingClosures();
    expect(await handler['dbService'].count('windowclosings')).toBe(0);
    expect(JSON.parse(mocks.request.mock.calls[3][1].body).closing_time).toBe(
      JSON.parse(mocks.request.mock.calls[1][1].body).closing_time,
    );
  });
});
