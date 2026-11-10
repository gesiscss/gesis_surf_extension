import { describe, expect, it, vi } from 'vitest';
import type { Tabs } from 'webextension-polyfill';
import TabEventManager from '../TabEventManager';
import type { DomainHandler, TabHandler } from '@root/lib/handlers';
import type { DatabaseService } from '@root/lib/db';

type UpdateListener = (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => Promise<void>;
type RemovalListener = (tabId: number, removeInfo: Tabs.OnRemovedRemoveInfoType) => Promise<void>;

const listeners = vi.hoisted(() => ({ update: undefined as unknown, removed: undefined as unknown }));

vi.mock('webextension-polyfill', () => ({
  tabs: {
    onUpdated: { addListener: (fn: unknown) => (listeners.update = fn) },
    onActivated: { addListener: vi.fn() },
    onRemoved: { addListener: (fn: unknown) => (listeners.removed = fn) },
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

  // ---------------------------------------------------------------
  // Tab removal: domain ownership + always close the tab row
  // ---------------------------------------------------------------

  /** Wires a manager whose active domain belongs to `ownerTabId` (or none when null). */
  const setupRemoval = async (ownerTabId: number | null, updateTabImpl?: (tabId: number) => Promise<void>) => {
    const store = new Map<string, unknown>([
      ['tab-session', { id: 42, close_time: '2026-01-01T00:00:00Z', tab_session_id: 'tab-session' }],
    ]);
    const deleted: string[] = [];
    const tabHandler = {
      generateTabSession: vi.fn(async () => 'tab-session'),
      updateTab: vi.fn(
        updateTabImpl ??
          (async (tabId: number) => {
            void tabId;
          }),
      ),
      deleteTabMapping: vi.fn(async (sessionId: string) => {
        deleted.push(sessionId);
        store.delete(sessionId);
      }),
      generateWindowSession: vi.fn(async () => 'window-session'),
    } as unknown as TabHandler;
    const dbService = {
      getItem: vi.fn(async (_table: string, key: string) => store.get(key) ?? null),
      deleteItem: vi.fn(async (_table: string, key: string) => store.delete(key)),
    } as unknown as DatabaseService;
    const domainHandler = { generateDomainSession: vi.fn() } as unknown as DomainHandler;

    const manager = new TabEventManager(tabHandler, dbService, domainHandler);
    manager['domainEventManager'].activeDomainSessionId =
      ownerTabId === null ? null : `gs-tabId-${ownerTabId}-domain-x`;
    manager['domainEventManager'].activeDomainBelongsTo = vi.fn(
      (tabId: number) => ownerTabId === tabId && ownerTabId !== null,
    );
    manager.registerTabListeners();
    return { tabHandler, deleted, store, onRemoved: listeners.removed as RemovalListener };
  };

  it('does not close the active domain of another tab when a background tab is removed', async () => {
    const { tabHandler, deleted, onRemoved } = await setupRemoval(7); // domain belongs to tab 7

    await onRemoved(5, { windowId: 1, isWindowClosing: false }); // tab 5 is removed

    const [, , , domainSessionId] = vi.mocked(tabHandler.updateTab).mock.calls[0];
    expect(domainSessionId).toBe(''); // no foreign domain handed to updateTab
    expect(deleted).toEqual(['tab-session']); // mapping always cleaned
  });

  it('always closes the tab row and cleans the mapping when no domain is active', async () => {
    const { tabHandler, deleted, store, onRemoved } = await setupRemoval(null);

    await onRemoved(5, { windowId: 1, isWindowClosing: false });

    expect(tabHandler.updateTab).toHaveBeenCalledTimes(1);
    const [tabIdArg] = vi.mocked(tabHandler.updateTab).mock.calls[0];
    expect(tabIdArg).toBe(5);
    expect(deleted).toEqual(['tab-session']);
    expect(store.has('tab-session')).toBe(false);
  });

  it('cleans the mapping even when the tab PATCH fails', async () => {
    const { tabHandler, deleted, onRemoved } = await setupRemoval(
      null,
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await onRemoved(5, { windowId: 1, isWindowClosing: false });

    expect(tabHandler.updateTab).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual(['tab-session']);
  });

  it('closes the domain owned by the removed foreground tab', async () => {
    const { tabHandler, deleted, onRemoved } = await setupRemoval(5); // domain belongs to tab 5

    await onRemoved(5, { windowId: 1, isWindowClosing: false });

    const [, , method, domainSessionId] = vi.mocked(tabHandler.updateTab).mock.calls[0];
    expect(method).toBe('PATCH');
    expect(domainSessionId).toBe('gs-tabId-5-domain-x');
    expect(deleted).toEqual(['tab-session']);
  });
});
