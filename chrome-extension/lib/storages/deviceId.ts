/**
 * @fileoverview Device ID management.
 *
 * Generates and persists a unique device ID per browser profile in
 * storage.local. Used by the API client (X-Device-Id header) and the
 * ElasticLogger to correlate all requests and logs from a single
 * browser installation.
 */
import { storage } from 'webextension-polyfill';

const DEVICE_ID_KEY = 'device_id';

/**
 * Ensures a device id exists in storage.local. Generates one on first
 * install and reuses it on every subsequent startup.
 * @returns The device id (existing or newly generated).
 */
export async function ensureDeviceId(): Promise<string> {
  const { device_id } = await storage.local.get(DEVICE_ID_KEY);
  if (device_id) return device_id as string;

  const newId = crypto.randomUUID();
  await storage.local.set({ [DEVICE_ID_KEY]: newId });
  console.log('[deviceId] Generated new device_id:', newId);
  return newId;
}

/**
 * Reads the current device id without generating one.
 * Returns undefined if no device id has been set yet.
 */
export async function getDeviceId(): Promise<string | undefined> {
  const { device_id } = await storage.local.get(DEVICE_ID_KEY);
  return device_id as string | undefined;
}
