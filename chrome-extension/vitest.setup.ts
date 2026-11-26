import { vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  default: {},
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    onInstalled: { addListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    onActivated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  windows: {
    getAll: vi.fn(),
    onFocusChanged: { addListener: vi.fn() },
  },
}));
