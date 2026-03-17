import { initializeClickListener } from "./content-script/clicks";
import { initializeHTMLCapture } from "./content-script/htmls";
import { initializeLLMTracking } from "./content-script/wavelets/llm";
import { initializeSocialTracking } from "./content-script/wavelets/socials";
import { initializeScrollListener } from "./content-script/scrolls";

async function initializeContentScript(): Promise<void> {
    try {
        initializeClickListener();
        console.log('[Content] Click listener initialized successfully');

        initializeHTMLCapture();
        console.log('[Content] HTML capture initialized successfully');

        initializeScrollListener();
        console.log('[Content] Scroll listener initialized successfully');

        await initializeLLMTracking();
        console.log('[Content] LLM tracking initialized successfully');

        initializeSocialTracking();
        console.log('[Content] Social tracking initialized successfully');
        console.log('[Content] All services initialized successfully');
    } catch (error) {
        console.error('[Content] Error initializing services:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void initializeContentScript());
} else {
    void initializeContentScript();
}