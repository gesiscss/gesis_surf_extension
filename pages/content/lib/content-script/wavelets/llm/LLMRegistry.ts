/**
 * @fileoverview Initializes and manages LLM tracking by registering specific extractors for supported platforms.
 */

import { ChatGPTWavelet } from './ChatGPTWavelet';
import { ClaudeWavelet } from './ClaudeWavelet';
import { GeminiWavelet } from './GeminiWavelet';

/**
 * Initializes LLM tracking by creating instances of supported extractors and calling their initialization methods.
 * This function should be called when the content script is loaded to ensure that LLM interactions are properly tracked.
 * @returns {void}
 */
export function initializeLLMTracking(): void {
    [new ChatGPTWavelet(), new ClaudeWavelet(), new GeminiWavelet()].forEach(e => e.initialize());
}