import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import DatabaseService from '../../../db/services/DatabaseService';
import { DB_CONFIG } from '../../../db/constants/dbConfig';
import DomainHandler from '../../../handlers/clients/DomainHandler';
import DomainEventManager from '../DomainEventManager';
import WaveletEventManager from '../WaveletEventManager';
import TabEventManager from '../TabEventManager';
import type { DomainDataTypes, DomainResponseTypes } from '../../../handlers/types/domainTypes';
import type { TabMapping, TabPayloadTypes } from '../../../handlers/types';
import type TabHandler from '../../../handlers/clients/TabHandler';
import type { Tabs } from 'webextension-polyfill';
import { apiRequestWithDevice } from '../../../services/apiClientWithDevice';
import type { LLMData } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

const state = vi.hoisted(() => ({
  db: undefined as DatabaseService | undefined,
  mask: undefined as string | undefined,
  blocked: false,
}));
vi.mock('@root/lib/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../db')>();
  return {
    ...actual,
    DatabaseService: vi.fn(function () {
      return state.db;
    }),
  };
});
vi.mock('@root/lib/services', () => ({
  GlobalSessionService: class {
    async getGlobalSessionId() {
      return 'global-session-test-windowId-1';
    }
  },
}));
vi.mock('@root/lib/services/policyService', () => ({
  DomainPolicyService: class {
    async getMaskedUrl() {
      return state.mask;
    }
    async evaluate(url: string, data: DomainDataTypes) {
      return {
        domain_url: state.mask ?? url,
        domain_title: data.title,
        domain_fav_icon: '',
        start_time: new Date().toISOString(),
        closing_time: new Date().toISOString(),
      };
    }
  },
  WaveletPolicyService: class {
    async evaluate() {
      return { action: state.blocked ? 'block' : 'allow' };
    }
  },
}));
vi.mock('@root/lib/services/apiClientWithDevice', () => ({ apiRequestWithDevice: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  tabs: {
    onUpdated: { addListener: vi.fn() },
    onActivated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
}));

const tab: DomainDataTypes = {
  id: 5,
  windowId: 1,
  url: 'https://example.com/#section',
  title: 'Example',
  status: 'complete',
  lastAccessed: 0,
  favIconUrl: '',
};
const mapping: TabMapping = {
  id: 'tab-uuid',
  url: tab.url,
  windowId: 1,
  domainSessionId: '',
  index: 0,
  highlighted: true,
  active: true,
  pinned: false,
  incognito: false,
};
const llm: LLMData = {
  chat_session_id: 'chat',
  message_content: 'test',
  timestamp: '2026-11-10T12:00:00Z',
  message_id: 'm1',
  message_type: 'user_question',
  llm_provider: 'chatgpt',
  turn_index: 0,
  page_title: 'Example',
  url: tab.url,
  domain_id: '',
};
let db: DatabaseService;
let handler: DomainHandler;
let manager: DomainEventManager;
let rows: DomainResponseTypes[];
let requests: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  state.mask = undefined;
  state.blocked = false;
  db = new DatabaseService();
  state.db = db;
  handler = new DomainHandler();
  manager = new DomainEventManager(handler);
  DomainHandler.clearVisitRegistryForTests();
  rows = [];
  requests = [];
  vi.mocked(apiRequestWithDevice).mockImplementation(async (url, options) => {
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    if (Array.isArray(body.domains)) {
      const payload = body.domains[0] as DomainResponseTypes;
      const row = { ...payload, id: rows.length + 1 };
      rows.push(row);
      return new Response(JSON.stringify({ domains: rows, created_domains: [row] }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
});

afterEach(async () => {
  DomainHandler.clearVisitRegistryForTests();
  (await db['db']).close();
  await deleteDB(DB_CONFIG.name);
  vi.useRealTimers();
});

async function keyFor(data = tab) {
  return handler.generateDomainSession(data.windowId, data.id, data.url, state.mask);
}

describe('Real Domain handler/manager/wavelet contract', () => {
  it('deduplicates completion notifications and keeps exact hints in wavelet and closing HTTP bodies', async () => {
    const key = await keyFor();
    await Promise.all([manager.handleDomainChange(key, tab, mapping), manager.handleDomainChange(key, tab, mapping)]);
    expect(rows).toHaveLength(1);
    expect(manager.activeDomainSessionId).toBe(key);
    expect(await db.getItem('domainslives', key)).toMatchObject({
      local_key: key,
      domain_session_id: rows[0].domain_session_id,
    });
    const wavelets = new WaveletEventManager('https://unit.invalid');
    expect((await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab })).status).toBe('success');
    expect(requests.at(-1)?.body).toMatchObject({ domain_id: '1', domain_session_id: rows[0].domain_session_id });
    await wavelets.handleSocialEvent(
      'X_POST',
      {
        id: 'post1',
        platform: 'x',
        signal_type: 'feed',
        author_handle: 'example',
        permalink: tab.url,
        captured_at: llm.timestamp,
        page_url: tab.url,
        content_text: 'test',
        likes: 0,
        comments: 0,
        is_public: true,
        is_protected: false,
        domain_id: '',
      },
      { tab: tab as Tabs.Tab },
    );
    expect(requests.at(-1)?.body).toMatchObject({
      domain_id: '1',
      domain_session_id: rows[0].domain_session_id,
      post_id: 'post1',
    });
    await manager.handleDomainCleanup();
    expect(requests.at(-1)?.body.domain_session_id).toBe(rows[0].domain_session_id);
    expect(await db.getItem('domainvisits', key)).toBeNull();
    expect(await db.getItem('domainslives', key)).toBeNull();
  });

  it('sends an early wavelet immediately with the exact hint later used by its Domain', async () => {
    const key = await keyFor();
    await manager.handleDomainChange(key, { ...tab, status: 'loading' }, mapping);
    const wavelets = new WaveletEventManager('https://unit.invalid');
    await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab });
    const wavelet = requests[0].body;
    expect(wavelet.domain_id).toBeUndefined();
    expect(wavelet.domain_session_id).toBe(await handler.wireSessionId(key));
    vi.setSystemTime(Date.now() + 20000);
    // Repeated loading notifications must not split an unfinished visit.
    await manager.handleDomainChange(key, { ...tab, status: 'loading' }, mapping);
    await manager.handleDomainChange(key, tab, mapping);
    expect(rows[0].domain_session_id).toBe(wavelet.domain_session_id);
    expect(rows[0].start_time).toBe('2026-11-10T12:00:00.000Z');
  });

  it.each(['pending', 'persisted'])('recovers the same hint across a worker restart (%s)', async phase => {
    const key = await keyFor();
    await manager.handleDomainChange(key, { ...tab, status: phase === 'pending' ? 'loading' : 'complete' }, mapping);
    const hint = await handler.wireSessionId(key);
    DomainHandler.clearVisitRegistryForTests();
    handler = new DomainHandler();
    manager = new DomainEventManager(handler);
    vi.setSystemTime(Date.now() + 60000);
    const wavelets = new WaveletEventManager('https://unit.invalid');
    await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab });
    expect(requests.at(-1)?.body.domain_session_id).toBe(hint);
    await manager.handleDomainChange(key, tab, mapping);
    expect(rows).toHaveLength(1);
    expect(rows[0].domain_session_id).toBe(hint);
  });

  it('initializes one durable timestamp across concurrent handler instances', async () => {
    const key = await keyFor();
    const starts = await Promise.all(Array.from({ length: 10 }, () => new DomainHandler().mintVisitStart(key)));
    expect(new Set(starts).size).toBe(1);
    expect(await db.count('domainvisits')).toBe(1);
  });

  it('does not mint or send a hint when a wavelet has no safe visit context', async () => {
    const wavelets = new WaveletEventManager('https://unit.invalid');
    await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab });
    expect(requests[0].body.domain_session_id).toBeUndefined();
    expect(await db.count('domainvisits')).toBe(0);
  });

  it('remints on an old reload and never supplies the old UUID during the new pending visit', async () => {
    const key = await keyFor();
    await manager.handleDomainChange(key, tab, mapping);
    const oldVisit = manager.activeVisit;
    const oldHint = rows[0].domain_session_id;
    vi.setSystemTime(Date.now() + 60000);
    await manager.handleDomainChange(key, { ...tab, status: 'loading' }, mapping);
    expect(requests.at(-1)?.body.domain_session_id).toBe(oldHint);
    const newHint = await handler.wireSessionId(key);
    expect(newHint).not.toBe(oldHint);
    const wavelets = new WaveletEventManager('https://unit.invalid');
    await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab });
    expect(requests.at(-1)?.body).toMatchObject({ domain_session_id: newHint });
    expect(requests.at(-1)?.body.domain_id).toBeUndefined();
    await manager.handleDomainCleanup(oldVisit);
    expect(manager.activeDomainSessionId).toBe(key);
    await manager.handleDomainChange(key, tab, mapping);
    expect(rows).toHaveLength(2);
    expect(rows[1].domain_session_id).toBe(newHint);
  });

  it('does not close tab B when it activates during the removed tab A PATCH', async () => {
    const key = await keyFor();
    let finishPatch!: () => void;
    const updateTab = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finishPatch = () => resolve(new Response('{}'));
        }),
    );
    const tabHandler = { updateTab, deleteTabMapping: vi.fn(async () => {}) } as unknown as TabHandler;
    const tabs = new TabEventManager(tabHandler, db, handler);
    manager = tabs['domainEventManager'];
    await manager.handleDomainChange(key, tab, mapping);
    const removalMapping: TabPayloadTypes = {
      id: 42,
      window: 1,
      domains: [],
      tab_session_id: 'tab-key',
      closing_time: llm.timestamp,
    };
    const removal = tabs['handleExistingTabRemoval'](5, removalMapping);
    await vi.waitFor(() => expect(updateTab).toHaveBeenCalledOnce());
    const tabB = { ...tab, id: 7 };
    const keyB = await keyFor(tabB);
    await manager.handleDomainChange(keyB, tabB, mapping);
    const countBefore = requests.length;
    finishPatch();
    await removal;
    expect(manager.activeDomainSessionId).toBe(keyB);
    expect(requests).toHaveLength(countBefore);
    expect(await db.getItem('domainslives', keyB)).not.toBeNull();
  });

  it('preserves host masking and blocks private wavelets before submission', async () => {
    state.mask = 'example.com';
    const key = await keyFor();
    await manager.handleDomainChange(key, tab, mapping);
    const wavelets = new WaveletEventManager('https://unit.invalid');
    await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab });
    expect(requests.at(-1)?.body.domain_session_id).toBe(rows[0].domain_session_id);
    expect(rows[0].domain_session_id).not.toContain('#section');
    state.blocked = true;
    const count = requests.length;
    expect((await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab })).status).toBe('blocked');
    expect(requests).toHaveLength(count);
  });

  it('reports identity storage failures rather than minting a replacement identity', async () => {
    const key = await keyFor();
    vi.spyOn(db, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(handler.mintVisitStart(key)).rejects.toThrow('storage unavailable');
    expect(handler.currentVisitStart(key)).toBeUndefined();
    expect(await db.count('domainvisits')).toBe(0);
    await expect(handler.mintVisitStart(key)).resolves.toBeDefined();
  });

  it('retries a lost response using the original title, URL, start and hint after restart', async () => {
    const key = await keyFor();
    const api = vi.mocked(apiRequestWithDevice);
    const normalRequest = api.getMockImplementation()!;
    let originalBody: RequestInit['body'];
    api.mockImplementationOnce(async (_url, options) => {
      originalBody = options?.body;
      throw new Error('response lost');
    });
    await manager.handleDomainChange(key, tab, mapping);
    const originalHint = await handler.wireSessionId(key);
    DomainHandler.clearVisitRegistryForTests();
    handler = new DomainHandler();
    manager = new DomainEventManager(handler);
    vi.setSystemTime(Date.now() + 60000);
    api.mockImplementation(normalRequest);
    await manager.handleDomainChange(key, { ...tab, title: 'Changed title' }, mapping);
    expect(rows).toHaveLength(1);
    expect(rows[0].domain_title).toBe('Example');
    expect(rows[0].domain_session_id).toBe(originalHint);
    expect(requests[0].body).toEqual(JSON.parse(String(originalBody)));
  });

  it('does not silently replace a corrupted persisted visit', async () => {
    const key = await keyFor();
    await db.setItem('domainvisits', {
      local_key: key,
      start_time: '2026-11-10T12:00:00.000Z',
      domain_session_id: `${key}#2026-11-10T13:00:00.000Z`,
    });
    await expect(handler.mintVisitStart(key)).rejects.toThrow('Stored visit start does not match');
    expect(handler.currentVisitStart(key)).toBeUndefined();
  });

  it('recognizes a real reload as a new visit even when the worker restarted', async () => {
    const key = await keyFor();
    await manager.handleDomainChange(key, tab, mapping);
    const originalHint = rows[0].domain_session_id;
    DomainHandler.clearVisitRegistryForTests();
    handler = new DomainHandler();
    manager = new DomainEventManager(handler);
    vi.setSystemTime(Date.now() + 60000);
    await manager.handleDomainChange(key, { ...tab, status: 'loading' }, mapping);
    expect(requests.at(-1)?.body.domain_session_id).toBe(originalHint);
    expect(await handler.wireSessionId(key)).not.toBe(originalHint);
    expect(await db.getItem('domainslives', key)).toBeNull();
  });

  it('closes the restored old URL before navigating elsewhere and returning', async () => {
    const oldKey = await keyFor();
    await manager.handleDomainChange(oldKey, tab, mapping);
    const originalHint = rows[0].domain_session_id;
    DomainHandler.clearVisitRegistryForTests();
    handler = new DomainHandler();
    manager = new DomainEventManager(handler);
    vi.setSystemTime(Date.now() + 60000);
    const other = { ...tab, url: 'https://other.example' };
    await manager.handleDomainChange(await keyFor(other), other, mapping);
    expect(await db.getItem('domainslives', oldKey)).toBeNull();
    expect(await db.getItem('domainvisits', oldKey)).toBeNull();
    vi.setSystemTime(Date.now() + 60000);
    await manager.handleDomainChange(oldKey, tab, mapping);
    expect(rows.at(-1)?.domain_session_id).not.toBe(originalHint);
  });

  it('can restore the owning visit for tab removal before any navigation event after restart', async () => {
    const key = await keyFor();
    await manager.handleDomainChange(key, tab, mapping);
    const hint = rows[0].domain_session_id;
    DomainHandler.clearVisitRegistryForTests();
    handler = new DomainHandler();
    manager = new DomainEventManager(handler);
    await manager.restoreDomainState('global-session-test-windowId-1-tabId-5');
    expect(manager.activeDomainBelongsTo(5)).toBe(true);
    const captured = manager.activeVisit;
    await manager.handleDomainCleanup(captured);
    expect(requests.at(-1)?.body.domain_session_id).toBe(hint);
    expect(await db.count('domainvisits')).toBe(0);
    expect(await db.count('domainslives')).toBe(0);
  });

  it('omits the old UUID while a reload is waiting for its previous visit to close', async () => {
    const key = await keyFor();
    await manager.handleDomainChange(key, tab, mapping);
    const api = vi.mocked(apiRequestWithDevice);
    const normalRequest = api.getMockImplementation()!;
    let finishClose!: () => void;
    api.mockImplementation(async (url, options, config) => {
      if (url.includes('/domain/domains/')) {
        await new Promise<void>(resolve => {
          finishClose = resolve;
        });
      }
      return normalRequest(url, options, config);
    });
    vi.setSystemTime(Date.now() + 60000);
    const reload = manager.handleDomainChange(key, { ...tab, status: 'loading' }, mapping);
    await vi.waitFor(() => expect(finishClose).toBeDefined());
    const wavelets = new WaveletEventManager('https://unit.invalid');
    await wavelets.handleLLMEvent(llm, { tab: tab as Tabs.Tab });
    expect(requests.at(-1)?.body.domain_id).toBeUndefined();
    expect(requests.at(-1)?.body.domain_session_id).toBeUndefined();
    finishClose();
    await reload;
    expect(await handler.wireSessionId(key)).not.toBe(rows[0].domain_session_id);
  });
});
