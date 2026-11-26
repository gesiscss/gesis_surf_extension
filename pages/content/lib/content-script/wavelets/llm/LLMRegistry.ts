/**
 * @fileoverview Initializes and manages LLM tracking by registering specific extractors for supported platforms.
 */

import { storage } from 'webextension-polyfill';
import { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { ChatGPTWavelet } from './ChatGPTWavelet';
import { ClaudeWavelet } from './ClaudeWavelet';
import { DeepSeekWavelet } from './DeepSeekWavelet';
import { GeminiWavelet } from './GeminiWavelet';

/**
 * Reads selector configs from extension storage (written by SelectorService in the background),
 * then creates wavelet instances with the matching config and initializes them.
 * Falls back to hardcoded selectors if storage is unavailable or empty.
 * @returns {Promise<void>}
 */
export async function initializeLLMTracking(): Promise<void> {
  let configs: Record<string, SelectorConfig> = {};
  try {
    const result = await storage.local.get('selectors');
    configs = (result['selectors'] as Record<string, SelectorConfig>) ?? {};
  } catch {
    // storage unavailable — wavelets will fall back to hardcoded selectors
  }

  [
    new ChatGPTWavelet(configs['chatgpt']),
    new ClaudeWavelet(configs['claude']),
    new DeepSeekWavelet(configs['deepseek']),
    new GeminiWavelet(configs['gemini']),
  ].forEach(e => e.initialize());
}
