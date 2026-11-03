import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readToken: vi.fn(),
  writeToken: vi.fn(),
  apiRequest: vi.fn(),
  sendMessage: vi.fn(),
  setIsAuthenticated: vi.fn(),
}));

vi.mock('@chrome-extension-boilerplate/shared/lib/storages/tokenStorage', () => ({
  readToken: mocks.readToken,
  writeToken: mocks.writeToken,
}));

vi.mock('@chrome-extension-boilerplate/shared/lib/services/apiClient', () => ({
  apiRequest: mocks.apiRequest,
}));

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage: mocks.sendMessage } },
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ setIsAuthenticated: mocks.setIsAuthenticated }),
}));

import Login from '../Login';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readToken.mockResolvedValue(null);
  mocks.writeToken.mockResolvedValue(undefined);
  mocks.sendMessage.mockResolvedValue({ status: 'success' });
  vi.spyOn(window, 'close').mockImplementation(() => undefined);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderLogin(isLoginWindow: boolean) {
  await act(async () => {
    root.render(
      <React.StrictMode>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<Login isLoginWindow={isLoginWindow} />} />
            <Route path="/home" element={<p>Connected</p>} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );
  });
}

function getInput(type: 'text' | 'password'): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[type="${type}"]`);
  if (!input) throw new Error(`Missing ${type} input`);
  return input;
}

async function fillForm(username: string, password: string) {
  await act(async () => {
    const usernameInput = getInput('text');
    usernameInput.value = username;
    Simulate.change(usernameInput);

    const passwordInput = getInput('password');
    passwordInput.value = password;
    Simulate.change(passwordInput);
  });
}

async function submitForm() {
  const form = container.querySelector('form');
  if (!form) throw new Error('Missing login form');
  await act(async () => Simulate.submit(form));
}

describe('login window', () => {
  it('opens the separate window once when the toolbar popup has no token', async () => {
    await renderLogin(false);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_LOGIN_WINDOW' });
    expect(window.close).toHaveBeenCalledOnce();
    expect(container.querySelector('form')).toBeNull();
  });

  it('shows an error and permits retry when the window cannot be opened', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ status: 'error' }).mockResolvedValue({ status: 'success' });
    await renderLogin(false);

    expect(container.textContent).toContain('Das Anmeldefenster konnte nicht geöffnet werden');
    expect(window.close).not.toHaveBeenCalled();

    const button = container.querySelector('button');
    if (!button) throw new Error('Missing retry button');
    await act(async () => Simulate.click(button));

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(window.close).toHaveBeenCalledOnce();
  });

  it('keeps the normal toolbar popup for an existing valid token', async () => {
    mocks.readToken.mockResolvedValue('existing-token');
    mocks.apiRequest.mockResolvedValue({ ok: true, status: 200 });
    await renderLogin(false);

    expect(container.textContent).toContain('Connected');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['a server error', () => mocks.apiRequest.mockResolvedValue({ ok: false, status: 503 })],
    ['a network error', () => mocks.apiRequest.mockRejectedValue(new TypeError('Failed to fetch'))],
  ])('keeps the session on %s', async (_label, arrange) => {
    mocks.readToken.mockResolvedValue('existing-token');
    arrange();
    await renderLogin(false);

    expect(mocks.writeToken).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Connected');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('clears a rejected token before opening the login window', async () => {
    mocks.readToken.mockResolvedValue('expired-token');
    mocks.apiRequest.mockResolvedValue({ ok: false, status: 401 });
    await renderLogin(false);

    expect(mocks.writeToken).toHaveBeenCalledWith(null);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_LOGIN_WINDOW' });
    expect(mocks.writeToken.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendMessage.mock.invocationCallOrder[0]);
  });

  it('submits a long password, stores the token, and notifies the background without sending the token', async () => {
    const password = 'Long-test-password-'.repeat(12);
    mocks.apiRequest.mockResolvedValue({ ok: true, json: async () => ({ token: 'new-token' }) });
    await renderLogin(true);
    await fillForm('test-id', password);
    await submitForm();

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ user_id: 'test-id', password }) }),
      expect.objectContaining({ method: 'POST', skipAuth: true }),
    );
    expect(mocks.writeToken).toHaveBeenCalledWith('new-token');
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_SUCCESS' });
    expect(mocks.writeToken.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendMessage.mock.invocationCallOrder[0]);
    expect(mocks.setIsAuthenticated).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain('Connected');
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('rejects a successful response without a usable token', async () => {
    mocks.apiRequest.mockResolvedValue({ ok: true, json: async () => ({ token: ' ' }) });
    await renderLogin(true);
    await fillForm('test-id', 'test-password');
    await submitForm();

    expect(container.textContent).toContain('kein gültiges Zugriffstoken');
    expect(mocks.writeToken).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Connected');
  });

  it('shows a background failure and allows the user to retry', async () => {
    mocks.apiRequest.mockResolvedValue({ ok: true, json: async () => ({ token: 'new-token' }) });
    mocks.sendMessage.mockResolvedValueOnce({ status: 'error' }).mockResolvedValue({ status: 'success' });
    await renderLogin(true);
    await fillForm('test-id', 'test-password');
    await submitForm();

    expect(mocks.writeToken).toHaveBeenCalledWith('new-token');
    expect(container.textContent).toContain('Die Anmeldung konnte im Hintergrund nicht abgeschlossen werden');
    expect(getInput('password').value).toBe('test-password');
    expect(container.textContent).not.toContain('Connected');

    await submitForm();
    expect(container.textContent).toContain('Connected');
  });
});
