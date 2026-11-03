import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  remove: vi.fn(),
  addListener: vi.fn(),
  handleMessage: vi.fn(),
  alarmCreate: vi.fn(),
  alarmClear: vi.fn(),
  alarmAddListener: vi.fn(),
  sessionGet: vi.fn(),
  sessionSet: vi.fn(),
  readToken: vi.fn(),
  writeToken: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  storage: { local: { get: mocks.get, remove: mocks.remove } },
  alarms: { create: mocks.alarmCreate, clear: mocks.alarmClear, onAlarm: { addListener: mocks.alarmAddListener } },
}));
vi.mock('@root/lib/events', () => ({ EventManager: vi.fn() }));
vi.mock('@root/lib/messages', () => ({ MessageHandler: vi.fn() }));
vi.mock('../../globalSession', () => ({ GlobalSessionService: vi.fn() }));
vi.mock('../../heartBeatService', () => ({ HeartbeatService: vi.fn() }));
vi.mock('../../privateModeService', () => ({ PrivateModeService: vi.fn() }));
vi.mock('../../dataCollectionService', () => ({ DataCollectionService: vi.fn() }));
vi.mock('../../hostService', () => ({ HostService: vi.fn() }));
vi.mock('../../selectorService', () => ({ SelectorService: vi.fn() }));
vi.mock('../../apiClientWithDevice', () => ({ apiRequestWithDevice: vi.fn() }));
vi.mock('../../logger', () => ({ logger: {} }));
vi.mock('@chrome-extension-boilerplate/shared/lib/storages/tokenStorage', () => ({
  readToken: mocks.readToken,
  writeToken: mocks.writeToken,
}));

import { AuthService } from '../AuthService';

let service: AuthService;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { onMessage: { addListener: mocks.addListener } },
    storage: { session: { get: mocks.sessionGet, set: mocks.sessionSet } },
  });
  mocks.get.mockResolvedValue({});
  mocks.readToken.mockResolvedValue('test-token');
  mocks.writeToken.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.handleMessage.mockResolvedValue(true);
  mocks.alarmCreate.mockResolvedValue(undefined);
  mocks.alarmClear.mockResolvedValue(true);
  mocks.sessionGet.mockResolvedValue({});
  mocks.sessionSet.mockResolvedValue(undefined);

  service = Object.create(AuthService.prototype);
  Object.assign(service, {
    isAuthenticated: false,
    collectionActive: false,
    initializationInFlight: null,
    messageListenerRegistered: false,
    retryListenerRegistered: false,
    validateToken: vi.fn().mockResolvedValue('valid'),
    initializeServices: vi.fn().mockResolvedValue(undefined),
    messageHandler: { handleMessage: mocks.handleMessage },
    privateModeService: { initialize: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('background authentication confirmation', () => {
  it('confirms authentication only after validating the token and initializing services', async () => {
    await expect(service.checkAuthentication()).resolves.toBe(true);

    expect(service.validateToken).toHaveBeenCalledOnce();
    expect(service.initializeServices).toHaveBeenCalledOnce();
    expect(service.isAuthenticated).toBe(true);
  });

  it('closes the login window after validating the token and before starting collection', async () => {
    const closeLoginWindow = vi.fn().mockResolvedValue(undefined);
    service.setBeforeCollectionStart(closeLoginWindow);

    await expect(service.checkAuthentication()).resolves.toBe(true);

    expect(closeLoginWindow).toHaveBeenCalledOnce();
    expect(closeLoginWindow.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(service.initializeServices).mock.invocationCallOrder[0],
    );
  });

  it('still starts collection if closing the login window fails', async () => {
    service.setBeforeCollectionStart(vi.fn().mockRejectedValue(new Error('window gone')));

    await expect(service.checkAuthentication()).resolves.toBe(true);

    expect(service.initializeServices).toHaveBeenCalledOnce();
  });

  it('keeps the login window open when the token is not valid', async () => {
    const closeLoginWindow = vi.fn().mockResolvedValue(undefined);
    service.setBeforeCollectionStart(closeLoginWindow);
    vi.mocked(service.validateToken).mockResolvedValue('server_unavailable');

    await service.checkAuthentication();

    expect(closeLoginWindow).not.toHaveBeenCalled();
  });

  it('returns false and removes a rejected token', async () => {
    vi.mocked(service.validateToken).mockResolvedValue('invalid_token');

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(mocks.writeToken).toHaveBeenCalledWith(null);
    expect(service.initializeServices).not.toHaveBeenCalled();
    expect(service.isAuthenticated).toBe(false);
  });

  it('returns false without deleting the token when validation is unreachable', async () => {
    vi.mocked(service.validateToken).mockResolvedValue('server_unavailable');

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(mocks.writeToken).not.toHaveBeenCalled();
    expect(service.initializeServices).not.toHaveBeenCalled();
  });

  it('returns false if service initialization fails', async () => {
    vi.mocked(service.initializeServices).mockRejectedValue(new Error('Initialization failed'));

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(service.isAuthenticated).toBe(false);
  });

  it('returns false when no token is present', async () => {
    mocks.readToken.mockResolvedValue(null);

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(service.validateToken).not.toHaveBeenCalled();
  });

  it('leaves global authentication and window messages for the background listener', async () => {
    service.startMessageListener();
    const listener = mocks.addListener.mock.calls[0][0];
    const sendResponse = vi.fn();

    expect(listener({ type: 'OPEN_LOGIN_WINDOW' }, {}, sendResponse)).toBe(false);
    expect(listener({ type: 'AUTH_SUCCESS' }, {}, sendResponse)).toBe(false);
    expect(mocks.handleMessage).not.toHaveBeenCalled();

    expect(listener({ type: 'PRIVATE_MODE' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(mocks.handleMessage).toHaveBeenCalledOnce());
  });
});

describe('service worker lifecycle', () => {
  const realService = () => {
    const s = Object.create(AuthService.prototype) as AuthService;
    Object.assign(s, {
      collectionActive: false,
      initializationInFlight: null,
      messageListenerRegistered: false,
      messageHandler: { handleMessage: mocks.handleMessage },
      privateModeService: { initialize: vi.fn().mockResolvedValue(undefined) },
      dataCollectionService: { initialize: vi.fn().mockResolvedValue(undefined), shouldCollectData: vi.fn(() => true) },
      hostService: { checkAndSyncVersion: vi.fn().mockResolvedValue(undefined) },
      selectorService: { checkAndSyncVersion: vi.fn().mockResolvedValue(undefined) },
      globalSessionService: { createGlobalSession: vi.fn().mockResolvedValue(undefined) },
      eventManager: { startListeners: vi.fn().mockResolvedValue(undefined) },
      heartbeatService: {
        startHeartbeat: vi.fn().mockResolvedValue(undefined),
        startAlarmAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    return s as AuthService & {
      eventManager: { startListeners: ReturnType<typeof vi.fn> };
      dataCollectionService: { shouldCollectData: ReturnType<typeof vi.fn> };
    };
  };

  it('starts collection only once, even for concurrent or repeated calls', async () => {
    const s = realService();

    await Promise.all([s.initializeServices(), s.initializeServices()]);
    await s.initializeServices();

    expect(s.eventManager.startListeners).toHaveBeenCalledOnce();
    expect(s.isCollectionActive()).toBe(true);
  });

  it('retries starting collection later if it was disabled', async () => {
    const s = realService();
    s.dataCollectionService.shouldCollectData.mockReturnValueOnce(false);

    await s.initializeServices();
    expect(s.isCollectionActive()).toBe(false);
    expect(s.eventManager.startListeners).not.toHaveBeenCalled();

    await s.initializeServices();
    expect(s.isCollectionActive()).toBe(true);
    expect(s.eventManager.startListeners).toHaveBeenCalledOnce();
  });

  it('a worker wake-up restores listeners and private mode without starting collection', () => {
    service.checkAuthentication = vi.fn().mockResolvedValue(true);

    service.start();
    service.startMessageListener();

    expect(mocks.addListener).toHaveBeenCalledOnce();
    expect(service.privateModeService.initialize).toHaveBeenCalled();
    expect(service.checkAuthentication).not.toHaveBeenCalled();
    expect(service.initializeServices).not.toHaveBeenCalled();
  });

  it('answers private mode even when collection is not active', async () => {
    service.start();
    const listener = mocks.addListener.mock.calls[0][0];

    expect(listener({ type: 'PRIVATE_MODE', action: 'GET_STATE' }, {}, vi.fn())).toBe(true);

    await vi.waitFor(() => expect(mocks.handleMessage).toHaveBeenCalledOnce());
  });

  it('waits for an in-progress initialization before handling content events', async () => {
    let finishInit: () => void = () => undefined;
    Object.assign(service, {
      initializationInFlight: new Promise<void>(resolve => {
        finishInit = resolve;
      }),
    });
    service.start();
    const listener = mocks.addListener.mock.calls[0][0];

    expect(listener({ type: 'CLICK_EVENT', data: {} }, {}, vi.fn())).toBe(true);
    await Promise.resolve();
    expect(mocks.handleMessage).not.toHaveBeenCalled();

    Object.assign(service, { collectionActive: true });
    finishInit();

    await vi.waitFor(() => expect(mocks.handleMessage).toHaveBeenCalledOnce());
  });

  it('rejects content events while collection is inactive', async () => {
    service.start();
    const listener = mocks.addListener.mock.calls[0][0];
    const sendResponse = vi.fn();

    listener({ type: 'CLICK_EVENT', data: {} }, {}, sendResponse);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Data collection is not active' }),
    );
    expect(mocks.handleMessage).not.toHaveBeenCalled();
  });
});

describe('reconnecting after a backend outage', () => {
  it('keeps the token and schedules a retry when the backend is unreachable', async () => {
    vi.mocked(service.validateToken).mockResolvedValue('server_unavailable');

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(mocks.writeToken).not.toHaveBeenCalled();
    expect(mocks.alarmCreate).toHaveBeenCalledWith('authRetry', { periodInMinutes: 1 });
  });

  it('keeps the token and schedules a retry when the network is down', async () => {
    vi.mocked(service.validateToken).mockResolvedValue('network_unavailable');

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(mocks.writeToken).not.toHaveBeenCalled();
    expect(mocks.alarmCreate).toHaveBeenCalledWith('authRetry', { periodInMinutes: 1 });
  });

  it('does not retry when access is forbidden (403), and keeps the token', async () => {
    vi.mocked(service.validateToken).mockResolvedValue('unexpected_response');

    await expect(service.checkAuthentication()).resolves.toBe(false);

    expect(mocks.writeToken).not.toHaveBeenCalled();
    expect(mocks.alarmCreate).not.toHaveBeenCalled();
    expect(mocks.alarmClear).toHaveBeenCalledWith('authRetry');
  });

  it('schedules a retry when starting collection fails', async () => {
    vi.mocked(service.initializeServices).mockRejectedValue(new Error('global session POST failed'));

    await service.checkAuthentication();

    expect(mocks.alarmCreate).toHaveBeenCalledWith('authRetry', { periodInMinutes: 1 });
  });

  it('cancels the retry when the token is valid, rejected or missing', async () => {
    await service.checkAuthentication();
    vi.mocked(service.validateToken).mockResolvedValue('invalid_token');
    await service.checkAuthentication();
    mocks.readToken.mockResolvedValue(null);
    await service.checkAuthentication();

    expect(mocks.alarmClear).toHaveBeenCalledTimes(3);
    expect(mocks.alarmCreate).not.toHaveBeenCalled();
  });

  it('starts collection from the retry alarm when no global session exists yet', async () => {
    service.start();
    service.start();
    expect(mocks.alarmAddListener).toHaveBeenCalledOnce();
    const onAlarm = mocks.alarmAddListener.mock.calls[0][0];

    onAlarm({ name: 'authRetry' });

    await vi.waitFor(() => expect(service.initializeServices).toHaveBeenCalledOnce());
  });

  it('ignores other alarms', async () => {
    service.start();
    const onAlarm = mocks.alarmAddListener.mock.calls[0][0];

    onAlarm({ name: 'heartBeat' });
    onAlarm({ name: 'privatemode' });
    await Promise.resolve();

    expect(mocks.readToken).not.toHaveBeenCalled();
  });

  it('never starts a second global session in the same browser session', async () => {
    mocks.sessionGet.mockResolvedValue({ collectionStartedThisBrowserSession: true });

    await service.retryStartup();

    expect(service.initializeServices).not.toHaveBeenCalled();
    expect(mocks.alarmClear).toHaveBeenCalledWith('authRetry');
  });

  it('records the started session and stops retrying once collection starts', async () => {
    const s = Object.create(AuthService.prototype) as AuthService;
    Object.assign(s, {
      collectionActive: false,
      initializationInFlight: null,
      privateModeService: { initialize: vi.fn().mockResolvedValue(undefined) },
      dataCollectionService: { initialize: vi.fn().mockResolvedValue(undefined), shouldCollectData: () => true },
      hostService: { checkAndSyncVersion: vi.fn().mockResolvedValue(undefined) },
      selectorService: { checkAndSyncVersion: vi.fn().mockResolvedValue(undefined) },
      globalSessionService: { createGlobalSession: vi.fn().mockResolvedValue(undefined) },
      eventManager: { startListeners: vi.fn().mockResolvedValue(undefined) },
      heartbeatService: {
        startHeartbeat: vi.fn().mockResolvedValue(undefined),
        startAlarmAll: vi.fn().mockResolvedValue(undefined),
      },
    });

    await s.initializeServices();

    expect(mocks.sessionSet).toHaveBeenCalledWith({ collectionStartedThisBrowserSession: true });
    expect(mocks.alarmClear).toHaveBeenCalledWith('authRetry');
  });
});
