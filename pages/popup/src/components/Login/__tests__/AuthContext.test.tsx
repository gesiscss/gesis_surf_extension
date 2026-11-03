import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readToken: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@chrome-extension-boilerplate/shared/lib/storages/tokenStorage', () => ({
  readToken: mocks.readToken,
  tokenStorage: { subscribe: mocks.subscribe },
}));

import { AuthProvider, useAuth } from '../AuthContext';

let container: HTMLDivElement;
let root: Root;
let onStorageChange: (() => void) | undefined;

const AuthStatus = () => {
  const { isAuthenticated } = useAuth();
  return <p>{isAuthenticated ? 'signed in' : 'signed out'}</p>;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readToken.mockResolvedValue(null);
  onStorageChange = undefined;
  mocks.subscribe.mockImplementation((listener: () => void) => {
    onStorageChange = listener;
    return () => {
      onStorageChange = undefined;
    };
  });
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

async function renderAuthProvider() {
  await act(async () => {
    root.render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );
  });
}

describe('shared authentication state', () => {
  it('updates when another extension context adds or removes the token', async () => {
    await renderAuthProvider();
    expect(container.textContent).toBe('signed out');

    mocks.readToken.mockResolvedValue('new-token');
    await act(async () => onStorageChange?.());
    expect(container.textContent).toBe('signed in');

    mocks.readToken.mockResolvedValue(null);
    await act(async () => onStorageChange?.());
    expect(container.textContent).toBe('signed out');
  });

  it('does not replace a newer storage update with an older read', async () => {
    let finishInitialRead: ((token: string | null) => void) | undefined;
    const initialRead = new Promise<string | null>(resolve => {
      finishInitialRead = resolve;
    });
    mocks.readToken.mockReturnValueOnce(initialRead).mockResolvedValue('new-token');
    await renderAuthProvider();

    await act(async () => onStorageChange?.());
    expect(container.textContent).toBe('signed in');

    if (!finishInitialRead) throw new Error('Initial token read was not started.');
    await act(async () => {
      finishInitialRead?.(null);
      await initialRead;
    });
    expect(container.textContent).toBe('signed in');
  });

  it('logs storage errors and does not report an authenticated session', async () => {
    const error = new Error('Storage unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.readToken.mockRejectedValue(error);

    await renderAuthProvider();

    expect(container.textContent).toBe('signed out');
    expect(log).toHaveBeenCalledWith('[AuthContext] Could not read the authentication token:', error);
  });
});
