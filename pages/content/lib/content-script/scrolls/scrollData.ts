import { ScrollData } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { runtime } from "webextension-polyfill";


let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

const scrollSession = {
    startY: window.scrollY || 0,
    maxDepth: 0,
    totalDistance: 0,
    lastY: window.scrollY || 0,
    scrollEvents: 0,
}

function calculateScrollMetrics(){
    const scrollY = window.scrollY || 0;
    const scrollX = window.scrollX || 0;
    const windowHeight = window.innerHeight || 0;
    const windowWidth = window.innerWidth || 0;
    const documentHeight = document.documentElement.scrollHeight || 0;
    const documentWidth = document.documentElement.scrollWidth || 0;

    const scrollDepth = Math.min(((scrollY + windowHeight) / documentHeight) * 100, 100);

    scrollSession.maxDepth = Math.max(scrollSession.maxDepth, scrollDepth);

    const distance = Math.abs(scrollY - scrollSession.lastY);
    scrollSession.totalDistance += distance;
    scrollSession.lastY = scrollY;
    scrollSession.scrollEvents += 1;

    return {
        scroll_depth_percentage: scrollDepth,
        max_scroll_depth: scrollSession.maxDepth,
        total_scroll_distance: scrollSession.totalDistance,
        scroll_events: scrollSession.scrollEvents,

        document_height: documentHeight,
        document_width: documentWidth,
        window_height: windowHeight,
        window_width: windowWidth,

        has_horizontal_scroll: scrollX > 0,
        reached_bottom: scrollDepth >= 95,

        reading_zone: scrollDepth < 25 ? 'header' :
                    scrollDepth < 50 ? 'upper_content' :
                    scrollDepth < 75 ? 'lower_content' : 'footer'
    };
}


function handleScroll(): void {
    if (scrollEndTimer) {
        clearTimeout(scrollEndTimer);
    }

    scrollEndTimer = setTimeout(() => {
        sendScrollData();
    }, 300);
}

function sendScrollData(): void {

    const metrics = calculateScrollMetrics();

    const scrollData: ScrollData = {
        scrollTime: new Date(),
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        pageXOffset: window.pageXOffset || 0,
        pageYOffset: window.pageYOffset || 0,
    };

    console.log(`📜[Scroll] SCROLL Depth: ${metrics.scroll_depth_percentage.toFixed(2)}% | Zone: ${metrics.reading_zone} | Events: ${metrics.scroll_events}`);
    console.log('📜[Scroll] Scroll Metrics:', metrics);
    console.log('📜[Scroll] Scroll Data:', scrollData);
    
    runtime.sendMessage({
        type: 'SCROLL_EVENT',
        data: {
            ...scrollData,
            scroll_metrics: metrics
        }
    }).then((response: { status: string; message?: string }) => {
        console.log('📜[Scroll] Scroll data sent successfully:', response);
    }).catch((error: Error) => {
        console.error('📜[Scroll] Error sending scroll data:', error);
    });
}

function sendFinalScrollSummary(): void {

    console.log('📜[Scroll] Page leave - Max scroll depth:', scrollSession.maxDepth.toFixed(2));
    
    if (scrollSession.scrollEvents > 0) {
        const scrollData: ScrollData = {
            scrollTime: new Date(),
            scrollX: window.scrollX || 0,
            scrollY: window.scrollY || 0,
            pageXOffset: window.pageXOffset || 0,
            pageYOffset: window.pageYOffset || 0,
        };

        runtime.sendMessage({
            type: 'SCROLL_FINAL',
            data: {
                ...scrollData,
                scroll_metrics: {
                    max_scroll_depth: scrollSession.maxDepth,
                    total_scroll_distance: scrollSession.totalDistance,
                    scroll_events: scrollSession.scrollEvents,
                    engagement: scrollSession.maxDepth > 75 ? 'high' :
                                scrollSession.maxDepth > 50 ? 'medium' :
                                scrollSession.maxDepth > 25 ? 'low' : 'minimal'
                }
            }
        }).catch(() => {});
    }
}

export function initializeScrollListener(): void {
    scrollSession.startY = window.scrollY || 0;
    scrollSession.lastY = window.scrollY || 0;

    window.addEventListener('scroll', handleScroll, { passive: true });

    window.addEventListener('beforeunload', sendFinalScrollSummary);

    console.log('📜[Scroll] Scroll listener initialized.');
}