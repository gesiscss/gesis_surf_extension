// Tests for MessageHandler — chrome-extension/lib/messages/handlers/MessageHandler.ts
//
// Mocks used:
//   - AuthService          (constructor arg)           — plain mock object with vi.fn() methods
//   - PrivateModeService   (constructor arg)           — plain mock object with vi.fn() methods
//   - ContentEventManager  (@root/lib/events/managers) — vi.mock to intercept the constructor
//   - readToken            (tokenStorage module)       — vi.mock
//   - @root/lib/handlers/shared                        — vi.mock to avoid import.meta.env issues
//
// isValidMessage is private — tested indirectly via handleMessage.
// handlePrivateMode and handleContentEvent are private — also tested via handleMessage.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Runtime } from 'webextension-polyfill';

// Mock ContentEventManager before MessageHandler is imported so that the constructor
// call inside MessageHandler gets the mock, not the real class.

/** Stable spy used by the mocked ContentEventManager instance. */
const mockHandleContentEvent = vi.hoisted(() => vi.fn().mockResolvedValue({ status: 'success', message: 'ok' }));

const mockContentEventManagerConstructor = vi.hoisted(() =>
  vi.fn(function (this: { handleContentEvent?: typeof mockHandleContentEvent }) {
    this.handleContentEvent = mockHandleContentEvent;
  }),
);

vi.mock('@root/lib/events/managers', () => ({
  ContentEventManager: mockContentEventManagerConstructor,
}));

// apiUrl comes from a file that uses import.meta.env — mock it to avoid Vite-only globals.
vi.mock('@root/lib/handlers/shared', () => ({
  apiUrl: 'https://test-api.example.com',
}));

// readToken is called inside handleAuthSuccess.
vi.mock('@chrome-extension-boilerplate/shared/lib/storages/tokenStorage', () => ({
  readToken: vi.fn().mockResolvedValue('test-token'),
}));

import { MessageHandler } from '../MessageHandler';
import type { AuthService, PrivateModeService } from '@root/lib/services';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A minimal sender object — MessageHandler only forwards it to ContentEventManager. */
const fakeSender = {} as Runtime.MessageSender;

// ─── Setup ────────────────────────────────────────────────────────────────────

let handler: MessageHandler;
let mockAuthService: { checkAuthentication: ReturnType<typeof vi.fn> };
let mockPrivateModeService: {
  getPrivateModeState: ReturnType<typeof vi.fn>;
  togglePrivateMode: ReturnType<typeof vi.fn>;
  getRemainingTime: ReturnType<typeof vi.fn>;
};
let sendResponse: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  mockHandleContentEvent.mockResolvedValue({ status: 'success', message: 'ok' });

  mockAuthService = {
    checkAuthentication: vi.fn().mockResolvedValue(undefined),
  };

  mockPrivateModeService = {
    getPrivateModeState: vi.fn().mockResolvedValue({ mode: false, alarm: '', remainingTime: 0 }),
    togglePrivateMode: vi
      .fn()
      .mockResolvedValue({ mode: true, alarm: '2025-01-01T00:00:00.000Z', remainingTime: 3600 }),
    getRemainingTime: vi.fn().mockResolvedValue(3600),
  };

  sendResponse = vi.fn();

  // Cast to unknown first — we only need the methods MessageHandler actually calls.
  handler = new MessageHandler(
    mockAuthService as unknown as AuthService,
    mockPrivateModeService as unknown as PrivateModeService,
  );
});

// ─── isValidMessage (tested via handleMessage) ────────────────────────────────

describe('isValidMessage (tested indirectly via handleMessage)', () => {
  it('responds with error and returns false when message is null', async () => {
    const result = await handler.handleMessage(null, fakeSender, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Invalid message format' });
  });

  it('responds with error and returns false when message has no type field', async () => {
    const result = await handler.handleMessage({ data: 'some-data' }, fakeSender, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Invalid message format' });
  });

  it('responds with error and returns false when type is not a string', async () => {
    const result = await handler.handleMessage({ type: 42 }, fakeSender, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Invalid message format' });
  });

  it('passes validation and routes to unknown-type handler when type is a valid string', async () => {
    // A well-formed message that has no recognised type — proves isValidMessage returned true
    // (otherwise it would say "Invalid message format", not "Unknown message type")
    const result = await handler.handleMessage({ type: 'UNKNOWN_TYPE' }, fakeSender, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Unknown message type' });
  });
});

// ─── handleMessage routing ────────────────────────────────────────────────────

describe('handleMessage routing', () => {
  it('routes PRIVATE_MODE → calls getPrivateModeState', async () => {
    await handler.handleMessage({ type: 'PRIVATE_MODE', action: 'GET_STATE' }, fakeSender, sendResponse);

    expect(mockPrivateModeService.getPrivateModeState).toHaveBeenCalled();
  });

  it('routes AUTH_SUCCESS → calls checkAuthentication', async () => {
    await handler.handleMessage({ type: 'AUTH_SUCCESS', token: 'abc' }, fakeSender, sendResponse);

    expect(mockAuthService.checkAuthentication).toHaveBeenCalled();
  });

  it('routes CLICK_EVENT → calls ContentEventManager.handleContentEvent', async () => {
    await handler.handleMessage({ type: 'CLICK_EVENT', data: {} }, fakeSender, sendResponse);

    expect(mockContentEventManagerConstructor).toHaveBeenCalled();
    expect(mockHandleContentEvent).toHaveBeenCalled();
  });

  it('routes SCROLL_EVENT → calls ContentEventManager.handleContentEvent', async () => {
    await handler.handleMessage({ type: 'SCROLL_EVENT', data: {} }, fakeSender, sendResponse);

    expect(mockHandleContentEvent).toHaveBeenCalled();
  });

  it('routes SCROLL_FINAL → calls ContentEventManager.handleContentEvent', async () => {
    await handler.handleMessage({ type: 'SCROLL_FINAL', data: {} }, fakeSender, sendResponse);

    expect(mockHandleContentEvent).toHaveBeenCalled();
  });

  it('routes HTML_CAPTURE → calls ContentEventManager.handleContentEvent', async () => {
    await handler.handleMessage({ type: 'HTML_CAPTURE', data: {} }, fakeSender, sendResponse);

    expect(mockHandleContentEvent).toHaveBeenCalled();
  });

  it('responds with error for an unknown message type', async () => {
    const result = await handler.handleMessage({ type: 'MYSTERY_EVENT' }, fakeSender, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Unknown message type' });
  });

  it('responds with error for an invalid message format', async () => {
    const result = await handler.handleMessage(undefined, fakeSender, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Invalid message format' });
  });
});

// ─── handlePrivateMode (tested via handleMessage) ─────────────────────────────

describe('handlePrivateMode (tested indirectly via handleMessage)', () => {
  it('GET_STATE → calls getPrivateModeState and responds with success + state', async () => {
    const state = { mode: false, alarm: '', remainingTime: 0 };
    mockPrivateModeService.getPrivateModeState.mockResolvedValue(state);

    await handler.handleMessage({ type: 'PRIVATE_MODE', action: 'GET_STATE' }, fakeSender, sendResponse);

    expect(mockPrivateModeService.getPrivateModeState).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', data: state });
  });

  it('TOGGLE with enable=true → calls togglePrivateMode(true) and responds with success + new state', async () => {
    const newState = { mode: true, alarm: '2025-01-01T00:00:00.000Z', remainingTime: 3600 };
    mockPrivateModeService.togglePrivateMode.mockResolvedValue(newState);

    await handler.handleMessage({ type: 'PRIVATE_MODE', action: 'TOGGLE', enable: true }, fakeSender, sendResponse);

    expect(mockPrivateModeService.togglePrivateMode).toHaveBeenCalledWith(true);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', data: newState });
  });

  it('TOGGLE without enable field → does not call togglePrivateMode and responds with error', async () => {
    await handler.handleMessage({ type: 'PRIVATE_MODE', action: 'TOGGLE' }, fakeSender, sendResponse);

    expect(mockPrivateModeService.togglePrivateMode).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      status: 'error',
      message: 'Enable parameter is required for TOGGLE action',
    });
  });

  it('GET_TIME → calls getRemainingTime and responds with success + time', async () => {
    mockPrivateModeService.getRemainingTime.mockResolvedValue(1800);

    await handler.handleMessage({ type: 'PRIVATE_MODE', action: 'GET_TIME' }, fakeSender, sendResponse);

    expect(mockPrivateModeService.getRemainingTime).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'success', data: 1800 });
  });

  it('unknown PRIVATE_MODE action → responds with error', async () => {
    await handler.handleMessage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { type: 'PRIVATE_MODE', action: 'NOT_A_REAL_ACTION' as any },
      fakeSender,
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Unknown PRIVATE_MODE action' });
  });
});
