/**
 * @fileoverview Initializes and manages LLM tracking by registering specific extractors for supported platforms.
 */

import { ChatGPTExtractor } from './ChatGPTExtractor';

/**
 * Initializes LLM tracking by creating instances of supported extractors and calling their initialization methods.
 * This function should be called when the content script is loaded to ensure that LLM interactions are properly tracked.
 * @returns {void}
 */
export function initializeLLMTracking(): void {
    [new ChatGPTExtractor()].forEach(e => e.initialize());
}