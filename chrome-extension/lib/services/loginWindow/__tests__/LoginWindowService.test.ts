import { beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  getURL: vi.fn((path: string) => `chrome-extension://test-extension/${path}`),
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  runtime: { getURL: browser.getURL },
  windows: {
    getAll: browser.getAll,
    create: browser.create,
    update: browser.update,
    remove: browser.remove,
  },
}));

import { LoginWindowService } from '../LoginWindowService';

const loginUrl = 'chrome-extension://test-extension/popup/login.html';

beforeEach(() => {
  vi.resetAllMocks();
  browser.getURL.mockImplementation(path => `chrome-extension://test-extension/${path}`);
  browser.getAll.mockResolvedValue([]);
  browser.create.mockResolvedValue({ id: 1 });
  browser.update.mockResolvedValue({ id: 1 });
});

describe('LoginWindowService', () => {
  it('creates a separate login window when none exists', async () => {
    await new LoginWindowService().open();

    expect(browser.getAll).toHaveBeenCalledWith({ populate: true, windowTypes: ['popup'] });
    expect(browser.create).toHaveBeenCalledWith({
      url: loginUrl,
      type: 'popup',
      width: 440,
      height: 680,
      focused: true,
    });
    expect(browser.update).not.toHaveBeenCalled();
  });

  it('focuses an existing login window without resetting the form', async () => {
    browser.getAll.mockResolvedValue([{ id: 42, state: 'normal', tabs: [{ url: loginUrl }] }]);

    await new LoginWindowService().open();

    expect(browser.update).toHaveBeenCalledWith(42, { focused: true });
    expect(browser.create).not.toHaveBeenCalled();
  });

  it('restores a minimized window whose login page is still loading', async () => {
    browser.getAll.mockResolvedValue([{ id: 42, state: 'minimized', tabs: [{ pendingUrl: loginUrl }] }]);

    await new LoginWindowService().open();

    expect(browser.update).toHaveBeenCalledWith(42, { focused: true, state: 'normal' });
    expect(browser.create).not.toHaveBeenCalled();
  });

  it('does not reuse unrelated popup windows', async () => {
    browser.getAll.mockResolvedValue([{ id: 42, tabs: [{ url: 'https://example.test/' }] }]);

    await new LoginWindowService().open();

    expect(browser.create).toHaveBeenCalledOnce();
    expect(browser.update).not.toHaveBeenCalled();
  });

  it('coalesces concurrent requests while the new window is opening', async () => {
    let finishCreation: ((value: { id: number }) => void) | undefined;
    browser.create.mockImplementation(() => new Promise(resolve => (finishCreation = resolve)));
    const service = new LoginWindowService();

    const first = service.open();
    const second = service.open();
    await vi.waitFor(() => expect(browser.create).toHaveBeenCalledOnce());
    expect(browser.getAll).toHaveBeenCalledOnce();

    if (!finishCreation) throw new Error('Window creation was not started.');
    finishCreation({ id: 1 });
    await Promise.all([first, second]);
  });

  it('reports a missing window ID rather than creating a duplicate', async () => {
    browser.getAll.mockResolvedValue([{ tabs: [{ url: loginUrl }] }]);

    await expect(new LoginWindowService().open()).rejects.toThrow('no window ID');
    expect(browser.create).not.toHaveBeenCalled();
  });

  it('propagates creation failures and permits a retry', async () => {
    browser.create.mockRejectedValueOnce(new Error('Window creation failed'));
    const service = new LoginWindowService();

    await expect(service.open()).rejects.toThrow('Window creation failed');
    await expect(service.open()).resolves.toBeUndefined();
    expect(browser.create).toHaveBeenCalledTimes(2);
  });

  it('propagates errors when an existing window cannot be focused', async () => {
    browser.getAll.mockResolvedValue([{ id: 42, tabs: [{ url: loginUrl }] }]);
    browser.update.mockRejectedValue(new Error('Window no longer exists'));

    await expect(new LoginWindowService().open()).rejects.toThrow('Window no longer exists');
    expect(browser.create).not.toHaveBeenCalled();
  });

  it('closes only login windows after a successful login', async () => {
    browser.remove.mockResolvedValue(undefined);
    browser.getAll.mockResolvedValue([
      { id: 42, tabs: [{ url: loginUrl }] },
      { id: 43, tabs: [{ url: 'https://example.test/' }] },
    ]);

    await new LoginWindowService().close();

    expect(browser.remove).toHaveBeenCalledOnce();
    expect(browser.remove).toHaveBeenCalledWith(42);
  });

  it('does nothing when no login window is open', async () => {
    await new LoginWindowService().close();

    expect(browser.remove).not.toHaveBeenCalled();
  });
});
