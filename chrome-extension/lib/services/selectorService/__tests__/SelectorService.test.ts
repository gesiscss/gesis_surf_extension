import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  count: vi.fn(),
  getAllItems: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  storage: { local: { get: mocks.get, set: mocks.set, remove: mocks.remove } },
}));
vi.mock('../../apiClientWithDevice', () => ({ apiRequestWithDevice: mocks.request }));
vi.mock('../../logger', () => ({ logger: {} }));
vi.mock('@root/lib/db/services/DatabaseService', () => ({
  default: class {
    count = mocks.count;
    getAllItems = mocks.getAllItems;
    setItem = mocks.setItem;
  },
}));

import { SelectorService } from '../SelectorService';

const selector = {
  family: 'llm',
  provider: 'CHATGPT',
  version: '2',
  hostname_patterns: ['chatgpt.com'],
  selectors: { root: ['main'] },
  is_active: true,
};
const version = () => Response.json({ extension: { selector_version: '2' } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(0);
  mocks.getAllItems.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe('SelectorService synchronization', () => {
  it('keeps polling after HTTP 202 Processing and publishes the completed result', async () => {
    vi.useFakeTimers();
    mocks.request
      .mockResolvedValueOnce(version())
      .mockResolvedValueOnce(Response.json({ task_id: 'selector-task' }))
      .mockResolvedValueOnce(Response.json({ status: 'Processing' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ result: [selector] }));

    const sync = new SelectorService().checkAndSyncVersion();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(mocks.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(sync).resolves.toBe(true);
    expect(mocks.request.mock.calls[3][0]).toBe(mocks.request.mock.calls[2][0]);
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith({
      selectors: { CHATGPT: selector },
      selector_version: '2',
    });
  });

  it.each(['1', '2'])('retries failed publication with stored version %s after IndexedDB is filled', async local => {
    const stored: Record<string, unknown> = { selector_version: local };
    mocks.get.mockImplementation(async () => ({ ...stored }));
    mocks.remove.mockImplementation(async (key: string) => {
      delete stored[key];
    });
    mocks.set.mockRejectedValueOnce(new Error('storage unavailable')).mockImplementation(async values => {
      Object.assign(stored, values);
    });
    mocks.setItem.mockImplementation(async () => {
      mocks.count.mockResolvedValue(1);
    });
    mocks.request
      .mockResolvedValueOnce(version())
      .mockResolvedValueOnce(Response.json([selector]))
      .mockResolvedValueOnce(version())
      .mockResolvedValueOnce(Response.json([selector]));

    const service = new SelectorService();
    await expect(service.checkAndSyncVersion()).resolves.toBe(false);
    expect(stored.selector_version).not.toBe('2');
    expect(stored.selectors).toBeUndefined();
    await expect(service.checkAndSyncVersion()).resolves.toBe(true);
    expect(stored).toEqual({ selector_version: '2', selectors: { CHATGPT: selector } });
  });
});
