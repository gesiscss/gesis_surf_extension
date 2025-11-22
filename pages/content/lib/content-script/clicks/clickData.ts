import { ClickData, MessageResponse } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { runtime } from "webextension-polyfill";


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

function logClickData(event: MouseEvent): void {

    if(!event.isTrusted) return;
    const mouseEvent = event as MouseEvent;
    const target = mouseEvent.target as HTMLElement;

    const clickType = getClickType(mouseEvent);

    const clickData: ClickData = {
        click_time: new Date(),
        click_type: clickType,
        click_target_element: target.textContent?.trim().substring(0, 255) || 'unknown',
        click_target_tag: target.tagName.toLowerCase(),
        click_target_class: target.className || 'no-class',
        click_page_x: mouseEvent.pageX,
        click_page_y: mouseEvent.pageY,
        click_referrer: document.referrer || 'no-referrer',
        domain_session_id: ''
    };

    console.log('🖱️[Click] CLICK DETECTED:', clickData);

    runtime.sendMessage({
        type: 'CLICK_EVENT',
        data: clickData
    }).then((response: MessageResponse) => {
        console.log('🖱️[Click] Click data sent successfully:', response);
    }).catch((error: Error) => {
        console.error('🖱️[Click] Error sending click data:', error);
    });
}

export function initializeClickListener(): void {
    document.addEventListener('contextmenu', logClickData, true);
    document.addEventListener('mousedown', logClickData, true);
    console.log('🖱️[Click] Click listener initialized.');
}