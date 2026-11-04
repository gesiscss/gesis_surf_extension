import { describe, expect, it, vi } from 'vitest';
import type { Tabs } from 'webextension-polyfill';
import TabEventManager from '../TabEventManager';
import type { DomainHandler, TabHandler } from '@root/lib/handlers';
import type { DatabaseService } from '@root/lib/db';

type UpdateListener = (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => Promise<void>;

const listeners = vi.hoisted(() => ({ update: undefined as unknown }));

vi.mock('webextension-polyfill', () => ({
  tabs: {
    onUpdated: { addListener: (fn: unknown) => (listeners.update = fn) },
    onActivated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    get: vi.fn(),
    query: vi.fn(),
  },
}));
vi.mock('@root/lib/handlers', () => ({}));
vi.mock('@root/lib/db', () => ({}));
vi.mock('@root/lib/services/policyService', () => ({
  DomainPolicyService: class {
    async getMaskedUrl(url: string) {
      return url;
    }
  },
}));
vi.mock('../DomainEventManager', () => ({
  default: class {
    handleDomainChange = vi.fn(async () => undefined);
    handleDomainCleanup = vi.fn(async () => undefined);
  },
}));

const tab = {
  id: 5,
  windowId: 1,
  url: 'https://example.com',
  title: 'Example',
  status: 'complete',
  index: 0,
  highlighted: true,
  active: true,
  pinned: false,
  incognito: false,
} as Tabs.Tab;

describe('TabEventManager', () => {
  it('creates a tab only once when completion events overlap', async () => {
    const store = new Map<string, unknown>();
    let finishPost!: () => void;

    const tabHandler = {
      generateTabSession: vi.fn(async () => 'tab-session'),
      sendTab: vi.fn(
        () =>
          new Promise<void>(resolve => {
            finishPost = () => {
              store.set('tab-session', { id: 42 });
              resolve();
            };
          }),
      ),
    } as unknown as TabHandler;
    const dbService = {
      getItem: vi.fn(async (_table: string, key: string) => store.get(key) ?? null),
    } as unknown as DatabaseService;
    const domainHandler = {
      generateDomainSession: vi.fn(async () => 'domain-session'),
    } as unknown as DomainHandler;

    new TabEventManager(tabHandler, dbService, domainHandler).registerTabListeners();
    const onUpdated = listeners.update as UpdateListener;

    const first = onUpdated(5, { status: 'complete' }, tab);
    const second = onUpdated(5, { status: 'complete' }, tab);

    await vi.waitFor(() => expect(tabHandler.sendTab).toHaveBeenCalledTimes(1));
    finishPost();
    await Promise.all([first, second]);

    expect(tabHandler.sendTab).toHaveBeenCalledTimes(1);
  });
});
