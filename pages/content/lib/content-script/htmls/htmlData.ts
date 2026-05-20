/**
 * @fileoverview Module to capture and send HTML content and meta tags from the current webpage.
 * @implements {IHTMLCapture}
 */
import { runtime } from 'webextension-polyfill';
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
    favicon_url: favicon,
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
    meta: metaTags,
  };

  console.log('📄[HTML] Capturing HTML content');

  runtime
    .sendMessage({
      type: 'HTML_CAPTURE',
      data: htmlString,
    })
    .then((response: { status: string; message?: string }) => {
      console.log('📄[HTML] HTML data sent successfully:', response);
    })
    .catch((error: Error) => {
      console.error('📄[HTML] Error sending HTML data:', error);
    });
}

/** Listen for HTML capture requests from the background script
 * @return voids
 */
function listenForCaptureRequest(): void {
  runtime.onMessage.addListener((message: { type: string }) => {
    if (message.type === 'REQUEST_HTML_CAPTURE') {
      console.log('📄[HTML] Received HTML capture request');
      captureHTML();
    }
  });
  console.log('📄[HTML] Listening for HTML capture requests');
}

/** Initialize HTML capture on page load
 * @returns void
 */
export function initializeHTMLCapture(): void {
  const captureOnQuiescence = () => {
    const DEBOUNCE_MS = 1000;
    const HARD_CAP_MS = 5000;
    let captured = false;

    const capture = () => {
      if (captured) return;
      captured = true;
      clearTimeout(hardCapTimer);
      clearTimeout(debounceTimer);
      observer.disconnect();
      captureHTML();
    };

    const hardCapTimer = setTimeout(capture, HARD_CAP_MS);
    let debounceTimer = setTimeout(capture, DEBOUNCE_MS);

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(capture, DEBOUNCE_MS);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'complete') {
    captureOnQuiescence();
  } else {
    window.addEventListener('load', captureOnQuiescence);
  }

  listenForCaptureRequest();

  console.log('📄[HTML] HTML capture initialized.');
}
