import { runtime } from "webextension-polyfill";
import { HTMLSnapshot } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

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


export function initializeHTMLCapture(): void {

    const captureWithDelay = () => {
        setTimeout(captureHTML, 1000);
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', captureWithDelay);
    } else {
        captureHTML();
    }
    console.log('📄[HTML] HTML capture initialized.');
}