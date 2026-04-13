import { describe, it, expect } from 'vitest';
import { ManifestParser } from '../index';
import type { Manifest } from '../type';

// Base manifest used across tests — minimal valid ManifestV3 shape
const baseManifest = {
  manifest_version: 3,
  name: 'Test Extension',
  version: '1.0.0',
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
} as unknown as Manifest;

// ─── env = 'chrome' ──────────────────────────────────────────────────────────

describe('convertManifestToString — env: chrome', () => {
  it('returns a valid JSON string', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'chrome');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('leaves background.service_worker unchanged', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'chrome');
    const parsed = JSON.parse(result);
    expect(parsed.background.service_worker).toBe('background.js');
  });

  it('does not add a scripts array to background', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'chrome');
    const parsed = JSON.parse(result);
    expect(parsed.background.scripts).toBeUndefined();
  });

  it('does not add options_ui', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'chrome');
    const parsed = JSON.parse(result);
    expect(parsed.options_ui).toBeUndefined();
  });

  it('does not add content_security_policy', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'chrome');
    const parsed = JSON.parse(result);
    expect(parsed.content_security_policy).toBeUndefined();
  });
});

// ─── env = 'firefox' ─────────────────────────────────────────────────────────

describe('convertManifestToString — env: firefox', () => {
  it('returns a valid JSON string', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'firefox');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('converts service_worker to a scripts array', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.background.scripts).toEqual(['background.js']);
  });

  it('removes service_worker after converting to scripts', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.background.service_worker).toBeUndefined();
  });

  it('adds content_security_policy for extension_pages', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
  });

  // ── options_ui — known bug ──────────────────────────────────────────────────
  //
  // BUG: when options_page is absent, the converter still writes options_ui
  // without a page property → Firefox rejects the manifest with:
  // "Error processing options_ui: Property 'page' is required"
  //
  // This test FAILS on the current code. It documents the bug and will pass
  // once the fix (only set options_ui when options_page exists) is applied.

  it('does NOT add options_ui when options_page is absent', () => {
    const result = ManifestParser.convertManifestToString(baseManifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.options_ui).toBeUndefined();
  });

  // ── options_ui — correct behaviour when options_page is set ────────────────

  it('adds options_ui.page when options_page is set', () => {
    const manifest = {
      ...baseManifest,
      options_page: 'options/index.html',
    } as unknown as Manifest;

    const result = ManifestParser.convertManifestToString(manifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.options_ui.page).toBe('options/index.html');
  });

  it('sets options_ui.browser_style to false when options_page is set', () => {
    const manifest = {
      ...baseManifest,
      options_page: 'options/index.html',
    } as unknown as Manifest;

    const result = ManifestParser.convertManifestToString(manifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.options_ui.browser_style).toBe(false);
  });

  it('removes options_page after converting to options_ui', () => {
    const manifest = {
      ...baseManifest,
      options_page: 'options/index.html',
    } as unknown as Manifest;

    const result = ManifestParser.convertManifestToString(manifest, 'firefox');
    const parsed = JSON.parse(result);
    expect(parsed.options_page).toBeUndefined();
  });
});