import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../storages/tokenStorage', () => ({
  readToken: vi.fn(),
}));

import { readToken } from '../../storages/tokenStorage';
import { apiRequest } from '../apiClient';

const endpoint = 'https://api.example.com/data';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('returns a synthetic 401 without making a request when no token is stored', async () => {
    vi.mocked(readToken).mockResolvedValue(null);

    const response = await apiRequest(endpoint);

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('includes the stored token in the Authorization header', async () => {
    vi.mocked(readToken).mockResolvedValue('test-token');
    const response = new Response(null, { status: 200 });
    vi.mocked(fetch).mockResolvedValue(response);

    expect(await apiRequest(endpoint)).toBe(response);
    expect(fetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Token test-token' }),
      }),
    );
  });

  it('does not read or send a token when authentication is skipped', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await apiRequest(endpoint, {}, { skipAuth: true });

    expect(readToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ headers: expect.not.objectContaining({ Authorization: expect.anything() }) }),
    );
  });

  it('returns an unsuccessful HTTP response for the caller to handle', async () => {
    vi.mocked(readToken).mockResolvedValue('test-token');
    const response = new Response(null, { status: 403 });
    vi.mocked(fetch).mockResolvedValue(response);

    expect(await apiRequest(endpoint)).toBe(response);
  });

  it('propagates network errors for the caller to handle', async () => {
    vi.mocked(readToken).mockResolvedValue('test-token');
    const error = new Error('Network failure');
    vi.mocked(fetch).mockRejectedValue(error);

    await expect(apiRequest(endpoint)).rejects.toBe(error);
  });
});
