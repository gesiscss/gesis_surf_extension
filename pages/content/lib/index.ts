import { initializeClickListener } from "./content-script/clicks";
import { initializeHTMLCapture } from "./content-script/htmls";

// console.log('[Content] Content script loaded')
// initializeClickListener();
// initializeHTMLCapture();

function initializeContentScript(): void {
    try {
        initializeClickListener();
        console.log('[Content] Click listener initialized successfully');

        initializeHTMLCapture();
        console.log('[Content] HTML capture initialized successfully');

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