/**
 * @fileoverview Module to capture and send HTML content and meta tags from the current webpage.
 * @implements {IHTMLCapture}
 */
import { runtime } from "webextension-polyfill";
import { HTMLSnapshot } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';


/**
 * Extract meta tags from the document
 * @returns Promise<Record<string, string>>
 */
async function getMetaTags(): Promise<Record<string, string>> {
    const title = document.title || '';
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const favicon = document.querySelector('link[rel="icon"]')?.getAttribute('href') || '';

    return {
        title,
        description,
        favicon_url: favicon
    };
}

/** Capture and send HTML content along with meta tags
 * @returns Promise<void>
 */
async function captureHTML(): Promise<void> {

    const htmlData = document.documentElement.cloneNode(true) as HTMLElement;
    const metaTags = await getMetaTags();

    console.log('📄[HTML] Meta tags extracted:', metaTags);
    
    const htmlString: HTMLSnapshot = {
        html_content: htmlData.outerHTML,
        meta: metaTags
    };

    console.log('📄[HTML] Capturing HTML content');

    runtime.sendMessage({
        type: 'HTML_CAPTURE',
        data: htmlString
    }).then((response: { status: string; message?: string }) => {
        console.log('📄[HTML] HTML data sent successfully:', response);
    }).catch((error: Error) => {
        console.error('📄[HTML] Error sending HTML data:', error);
    });
}

/** Initialize HTML capture on page load
 * @returns void
 */
export function initializeHTMLCapture(): void {

    const captureWithDelay = () => {
        setTimeout(captureHTML, 1000);
    };
    
    if (document.readyState === 'complete') {
        captureWithDelay();
    } else {
        window.addEventListener('load', captureWithDelay);
    }
    console.log('📄[HTML] HTML capture initialized.');
}