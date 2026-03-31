/**
 * Module for capturing and sending click event data from content scripts
 */
import { ClickData, MessageResponse } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { runtime } from "webextension-polyfill";

/**
 * Get click type based on MouseEvent button property
 * @param event MouseEvent
 * @returns Click type as string
 */
function getClickType (event: MouseEvent): string {
    switch (event.button) {
        case 0:
            return 'left';
        case 1:
            return 'middle';
        case 2:
            return 'right';
        case -1:
            return 'right'; // contextmenu event
        default:
            return 'unknown';
    }
}

/** 
 * Get a descriptive text for the clicked element
 * @param element The HTML element
 * @returns Element text as string
 */
function getElementText(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    
    if (['style', 'script', 'noscript', 'svg', 'path'].includes(tagName)) {
        return `<${tagName}>`;
    }

    if (tagName === 'input') {
        const input = element as HTMLInputElement;
        return input.value || input.placeholder || input.type || 'input';
    }

    if (tagName === 'button') {
        return element.innerText?.trim() || element.getAttribute('aria-label') || 'button';
    }

    if (tagName === 'a') {
        const anchor = element as HTMLAnchorElement;
        return element.innerText?.trim() || anchor.title || anchor.href || 'link';
    }

    if (tagName === 'img') {
        const img = element as HTMLImageElement;
        return img.alt || img.title || img.src?.split('/').pop() || 'image';
    }

    let text = element.innerText?.trim() || '';
    
    if (text.length > 255) {
        const label = element.getAttribute('aria-label') || element.title;
        if (label) {
            return label.substring(0, 255);
        }
        text = text.substring(0, 252) + '...';
    }

    return text || element.getAttribute('aria-label') || element.title || tagName;
}

/**
 * Get a descriptive class name, handling className edge cases
 * @param element The HTML element
 * @returns Class name as string
 */
function getClassName(element: HTMLElement): string {

    const classAttr = element.getAttribute('class');
    
    if (classAttr) {
        return classAttr;
    }

    if (typeof element.className === 'string') {
        return element.className || 'no-class';
    }
    
    if (typeof element.className === 'string' && element.className) {
        return element.className;
    }

    return 'no-class';
}

/**
 * Logs click event data and sends it to the background script
 * @param event MouseEvent
 * @returns void
 */
function logClickData(event: MouseEvent): void {

    if(!event.isTrusted) return;
    const mouseEvent = event as MouseEvent;
    const target = mouseEvent.target as HTMLElement;

    const clickType = getClickType(mouseEvent);

    const clickData: ClickData = {
        click_time: new Date(),
        click_type: clickType,
        click_page_x: mouseEvent.pageX,
        click_page_y: mouseEvent.pageY,
        click_target_element: getElementText(target),
        click_target_tag: target.tagName?.toLowerCase() || 'unknown',
        click_target_id: target.id || 'unknown',
        click_target_class: getClassName(target),
        click_referrer: document.referrer || 'no-referrer',
        domain_session_id: ''
    };

    runtime.sendMessage({
        type: 'CLICK_EVENT',
        data: clickData
    }).then((response: MessageResponse) => {
        console.log('[Click] Click data sent successfully:', response);
    }).catch((error: Error) => {
        console.error('[Click] Error sending click data:', error);
    });
}

/**
 * Initialize click event listeners
 * @returns void
 */
export function initializeClickListener(): void {
    document.addEventListener('contextmenu', logClickData, true);
    document.addEventListener('mousedown', logClickData, true);
    console.log('[Click] Click listener initialized.');
}