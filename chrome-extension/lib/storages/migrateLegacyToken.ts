import { storage } from 'webextension-polyfill';
import { readToken, writeToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';

/**
 * Legacy key used by Fernando's old extension (v1.x).
 * Stored the full GESIS `/user/token/` response: `{ token: "..." }`.
 */
const LEGACY_KEY = 'WTG_User';

interface LegacyToken {
  token: string;
}

/**
 * One-time migration: Fernando's old `WTG_User` (object) → current `token` (string).
 *
 * - Idempotent: no-op if `token` already exists or `WTG_User` is absent.
 * - Safe to call on every startup.
 * - Removes the legacy key after a successful migration.
 *
 * Uses `webextension-polyfill` so it works in both Chrome and Firefox.
 */
export async function migrateLegacyToken(): Promise<void> {
  // Already have a token? Nothing to do.
  const existing = await readToken();
  if (existing) return;

  const result = await storage.local.get(LEGACY_KEY);
  const legacy: unknown = result[LEGACY_KEY];
  if (!legacy) return; // fresh install, no legacy data

  // chrome.storage.local holds the object directly; localStorage copy was stringified.
  // Handle both shapes defensively.
  const parsed: LegacyToken | null = typeof legacy === 'string' ? safeParse(legacy) : (legacy as LegacyToken);

  const tokenValue = parsed?.token;
  if (!tokenValue || typeof tokenValue !== 'string') {
    // Malformed legacy entry — remove it so we don't keep retrying.
    await storage.local.remove(LEGACY_KEY);
    console.warn('[migrate] WTG_User present but no valid token field — removed.');
    return;
  }

  await writeToken(tokenValue);
  await storage.local.remove(LEGACY_KEY);
  console.info('[migrate] WTG_User → token: migrated legacy token');
}

function safeParse(s: string): LegacyToken | null {
  try {
    return JSON.parse(s) as LegacyToken;
  } catch {
    return null;
  }
}
