import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindowHandler } from '@root/lib/handlers';

const browser = vi.hoisted(() => ({
  focusedWindowId: null as number | null,
  openWindowIds: [] as number[],
  listeners: {
    created: undefined as undefined | ((win: { id?: number }) => void),
    removed: undefined as undefined | ((windowId: number) => void),
    focusChanged: undefined as undefined | ((windowId: number) => void),
  },
}));

const toWindow = (id: number) => ({ id, top: 0, focused: browser.focusedWindowId === id, type: 'normal' });

vi.mock('webextension-polyfill', () => ({
  windows: {
    onCreated: { addListener: (fn: (win: { id?: number }) => void) => (browser.listeners.created = fn) },
    onRemoved: { addListener: (fn: (windowId: number) => void) => (browser.listeners.removed = fn) },
    onFocusChanged: { addListener: (fn: (windowId: number) => void) => (browser.listeners.focusChanged = fn) },
    getAll: async () => browser.openWindowIds.map(toWindow),
    get: async (id: number) => toWindow(id),
    getLastFocused: async () => ({ focused: browser.focusedWindowId !== null }),
  },
}));
vi.mock('@root/lib/handlers', () => ({}));
vi.mock('@root/lib/handlers/shared', () => ({
  InfoTypeValues: {
    OnCreated: 'onCreated',
    OnFocusChanged: 'onFocusChanged',
    OnBlurred: 'onBlurred',
    OnRemoved: 'onRemoved',
  },
}));

import WindowEventManager from '../WindowEventManager';

interface WindowRow {
  id: number;
  windowNum: number;
  closedAs: string | null;
}

/** Simulates the backend and the winlives mapping kept by WindowHandler. */
class FakeWindowHandler {
  rows: WindowRow[] = [];
  mappings = new Map<number, WindowRow>();
  patchGate: Promise<void> | null = null;

  async hasWindowRecord(windowId: number): Promise<boolean> {
    return this.mappings.has(windowId);
  }

  async sendWindow(window: { id?: number }): Promise<void> {
    const row: WindowRow = { id: this.rows.length + 1, windowNum: window.id!, closedAs: null };
    this.rows.push(row);
    this.mappings.set(window.id!, row);
  }

  async updateWindow(windowId: number, info: string): Promise<void> {
    const row = this.mappings.get(windowId);
    if (!row) {
      throw new Error(`Payload not found for window ${windowId}`);
    }
    if (this.patchGate) {
      await this.patchGate;
    }
    row.closedAs = info;
    this.mappings.delete(windowId);
  }

  async globalSessionId(windowId: number): Promise<string> {
    return `global-session-windowId-${windowId}`;
  }

  rowsFor(windowNum: number): WindowRow[] {
    return this.rows.filter(row => row.windowNum === windowNum);
  }
}

const setup = async (openWindowIds: number[], focusedWindowId: number | null) => {
  browser.openWindowIds = openWindowIds;
  browser.focusedWindowId = focusedWindowId;
  const handler = new FakeWindowHandler();
  const manager = new WindowEventManager(handler as unknown as WindowHandler);
  const lost: Array<number | null> = [];
  const gained: number[] = [];
  manager.onFocusLost(windowId => void lost.push(windowId));
  manager.onFocusGained(windowId => void gained.push(windowId));
  await manager.registerWindowListeners();
  return { handler, lost, gained };
};

const focus = (windowId: number) => {
  browser.focusedWindowId = windowId === -1 ? null : windowId;
  browser.listeners.focusChanged!(windowId);
};

const settle = () => vi.advanceTimersByTimeAsync(2000);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WindowEventManager focus periods', () => {
  it('closes the startup window on focus loss and opens a new row on return', async () => {
    const { handler, lost, gained } = await setup([1], 1);

    focus(-1);
    await settle();
    focus(1);
    await settle();

    const rows = handler.rowsFor(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].closedAs).toBe('onBlurred');
    expect(rows[1].closedAs).toBeNull();
    expect(handler.mappings.get(1)).toBe(rows[1]);
    expect(lost).toEqual([1]);
    expect(gained).toEqual([1]);
  });

  it('does not duplicate the startup row on the first focus event', async () => {
    const { handler } = await setup([1], 1);

    focus(1);
    await settle();

    expect(handler.rowsFor(1)).toHaveLength(1);
  });

  it('records every startup window but only the focused one as active', async () => {
    const { handler } = await setup([1, 2], 2);

    focus(-1);
    await settle();

    expect(handler.rowsFor(1)[0].closedAs).toBeNull();
    expect(handler.rowsFor(2)[0].closedAs).toBe('onBlurred');
  });

  it('keeps a mapping when the user returns while the focus loss is still being sent', async () => {
    const { handler, gained } = await setup([1], 1);
    let releasePatch!: () => void;
    handler.patchGate = new Promise(resolve => (releasePatch = resolve));

    focus(-1);
    await settle();
    focus(1);
    await settle();
    releasePatch();
    await settle();

    const rows = handler.rowsFor(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].closedAs).toBe('onBlurred');
    expect(handler.mappings.get(1)).toBe(rows[1]);
    expect(gained).toEqual([1]);
  });

  it('treats a switch through "no window focused" as a window change', async () => {
    const { handler, lost, gained } = await setup([1, 2], 1);

    focus(-1);
    focus(2);
    await settle();

    expect(handler.rowsFor(1)[0].closedAs).toBe('onFocusChanged');
    expect(handler.mappings.has(2)).toBe(true);
    expect(lost).toEqual([1]);
    expect(gained).toEqual([2]);
  });

  it('creates a new row for a window that lost focus earlier', async () => {
    const { handler } = await setup([1, 2], 1);

    focus(2);
    await settle();
    focus(1);
    await settle();
    focus(2);
    await settle();

    const rows = handler.rowsFor(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].closedAs).toBe('onFocusChanged');
    expect(handler.mappings.get(2)).toBe(rows[1]);
  });

  it('closes the previous window once when a new window opens and takes focus', async () => {
    const { handler, gained } = await setup([1], 1);
    const patch = vi.spyOn(handler, 'updateWindow');

    browser.openWindowIds.push(2);
    browser.listeners.created!({ id: 2 });
    focus(2);
    await settle();

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(1, 'onFocusChanged', 'PATCH');
    expect(handler.rowsFor(2)).toHaveLength(1);
    expect(gained).toEqual([2]);
  });

  it('ignores a brief focus loss to the same window', async () => {
    const { handler, lost, gained } = await setup([1], 1);

    focus(-1);
    await vi.advanceTimersByTimeAsync(300);
    focus(1);
    await settle();

    expect(handler.rowsFor(1)).toHaveLength(1);
    expect(handler.rowsFor(1)[0].closedAs).toBeNull();
    expect(lost).toEqual([]);
    expect(gained).toEqual([]);
  });

  it('closes a removed window without failing on windows that have no open row', async () => {
    const { handler } = await setup([1, 2], 1);

    focus(2);
    await settle();
    browser.listeners.removed!(1);
    browser.listeners.removed!(2);
    await settle();

    expect(handler.rowsFor(1)[0].closedAs).toBe('onFocusChanged');
    expect(handler.rowsFor(2)[0].closedAs).toBe('onRemoved');
  });
});
