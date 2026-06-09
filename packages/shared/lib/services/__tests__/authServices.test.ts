// Tests for authServices — packages/shared/lib/services/authServices.ts
//
// Mocks used:
//   - fetch          (global browser/Node API) — replaced with a fake via vi.stubGlobal
//   - readToken      (tokenStorage module)     — replaced with a fake via vi.mock

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Replace readToken with a controllable fake.
// Path is relative to THIS test file → ../../storages/tokenStorage
vi.mock('../../storages/tokenStorage', () => ({
  readToken: vi.fn(),
}));

import { readToken } from '../../storages/tokenStorage';
import { validateToken, apiRequest } from '../authServices';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal fake Response object.
 * Only the properties read by authServices.ts need to be set.
 */
function fakeResponse(ok: boolean, data?: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Replace the global fetch with a fake for every test.
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  // Put global fetch back to its original after each test.
  vi.unstubAllGlobals();
});

// ─── validateToken ────────────────────────────────────────────────────────────

describe('validateToken', () => {
  const TOKEN = 'test-token-abc';
  const VALIDATE_URL = 'https://api.example.com/user/me';

  it('returns "invalid_token" when the response is 401 Unauthorized', async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(false, null, 401, 'Unauthorized'));

    expect(await validateToken(TOKEN, VALIDATE_URL)).toBe('invalid_token');
  });

  it('returns "unexpected_response" when response is ok but user_id is missing from the body', async () => {
    // Server returns 200 but the body has no user_id field
    vi.mocked(fetch).mockResolvedValue(fakeResponse(true, { waves: [] }));

    expect(await validateToken(TOKEN, VALIDATE_URL)).toBe('unexpected_response');
  });

  it('returns "valid" when response is ok and user_id is present in the body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      fakeResponse(true, { user_id: 'user-42', waves: [], privacy: null, extension: null }),
    );

    expect(await validateToken(TOKEN, VALIDATE_URL)).toBe('valid');
  });

  it('returns "network_unavailable" when fetch throws a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network failure'));

    expect(await validateToken(TOKEN, VALIDATE_URL)).toBe('network_unavailable');
  });

  it('sends the token in the Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(
      fakeResponse(true, { user_id: 'user-42', waves: [], privacy: null, extension: null }),
    );

    await validateToken(TOKEN, VALIDATE_URL);

    expect(fetch).toHaveBeenCalledWith(
      VALIDATE_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Token ${TOKEN}` }),
      }),
    );
  });
});

// ─── apiRequest ───────────────────────────────────────────────────────────────

describe('apiRequest', () => {
  const ENDPOINT = 'https://api.example.com/data';
  const TOKEN = 'my-stored-token';

  it('throws ApiError 401 when no token is stored and skipAuth is false', async () => {
    vi.mocked(readToken).mockResolvedValue(null);

    await expect(apiRequest(ENDPOINT)).rejects.toMatchObject({
      status: 401,
      name: 'ApiError',
    });
  });

  it('includes the Authorization header when a token is stored', async () => {
    vi.mocked(readToken).mockResolvedValue(TOKEN);
    vi.mocked(fetch).mockResolvedValue(fakeResponse(true));

    await apiRequest(ENDPOINT);

    expect(fetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Token ${TOKEN}` }),
      }),
    );
  });

  it('does not include Authorization header when skipAuth is true', async () => {
    // readToken is NOT called when skipAuth is true, so no need to mock it
    vi.mocked(fetch).mockResolvedValue(fakeResponse(true));

    await apiRequest(ENDPOINT, {}, 'GET', true);

    const calledHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(calledHeaders?.Authorization).toBeUndefined();
  });

  it('returns the Response object on a successful request', async () => {
    vi.mocked(readToken).mockResolvedValue(TOKEN);
    const response = fakeResponse(true);
    vi.mocked(fetch).mockResolvedValue(response);

    const result = await apiRequest(ENDPOINT);

    expect(result).toBe(response);
  });

  it('throws ApiError with the response status when the response is not ok', async () => {
    vi.mocked(readToken).mockResolvedValue(TOKEN);
    vi.mocked(fetch).mockResolvedValue(fakeResponse(false, null, 404, 'Not Found'));

    await expect(apiRequest(ENDPOINT)).rejects.toMatchObject({
      status: 404,
      statusText: 'Not Found',
      name: 'ApiError',
    });
  });

  it('throws ApiError 500 when fetch throws an unexpected non-ApiError error', async () => {
    vi.mocked(readToken).mockResolvedValue(TOKEN);
    vi.mocked(fetch).mockRejectedValue(new Error('Unexpected crash'));

    await expect(apiRequest(ENDPOINT)).rejects.toMatchObject({
      status: 500,
      name: 'ApiError',
    });
  });
});
