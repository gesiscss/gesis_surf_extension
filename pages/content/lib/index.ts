import { initializeClickListener } from "./content-script/clicks";
import { initializeHTMLCapture } from "./content-script/htmls";
import { initializeLLMTracking } from "./content-script/wavelets/llm/LLMRegistry";
import { initializeXTracking } from "./content-script/wavelets/socials/XWavelet";
import { initializeScrollListener } from "./content-script/scrolls";

function initializeContentScript(): void {
    try {
        initializeClickListener();
        console.log('[Content] Click listener initialized successfully');

        initializeHTMLCapture();
        console.log('[Content] HTML capture initialized successfully');

        initializeScrollListener();
        console.log('[Content] Scroll listener initialized successfully');

        initializeLLMTracking();
        console.log('[Content] LLM tracking initialized successfully');

        initializeXTracking();
        console.log('[Content] X tracking initialized successfully');
        console.log('[Content] All services initialized successfully');
    } catch (error) {
        console.error('[Content] Error initializing services:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
    initializeContentScript();
}