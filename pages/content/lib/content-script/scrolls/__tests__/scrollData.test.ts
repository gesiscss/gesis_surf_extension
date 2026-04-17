// @vitest-environment jsdom
//
// Tests for pages/content/lib/content-script/scrolls/scrollData.ts
//
// Strategy:
//   calculateScrollMetrics, handleScroll, sendScrollData, and sendFinalScrollSummary
//   are all private — they are tested indirectly through initializeScrollListener.
//
//   1. vi.resetModules() in beforeEach resets scrollSession to zero for every test.
//   2. window.scrollY, window.innerHeight, and document.documentElement.scrollHeight
//      are controlled via Object.defineProperty to produce exact depth values.
//      Using innerHeight=0 and documentHeight=1000 the formula simplifies to:
//        depth = scrollY / 10
//      making it trivial to hit exact zone boundaries and thresholds.
//   3. vi.useFakeTimers() fires the 300 ms handleScroll debounce synchronously.
//   4. The 'scroll' and 'beforeunload' handlers are captured via a window.addEventListener
//      spy and then invoked directly — same pattern as clickData.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ status: 'success' }),
  },
}));

// ─── Per-test state ───────────────────────────────────────────────────────────

let initializeScrollListener: () => void;
let sendMessage: ReturnType<typeof vi.fn>;
let scrollHandler: () => void;
let beforeunloadHandler: () => void;

// ─── DOM property helpers ─────────────────────────────────────────────────────

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true });
}

function setWindowHeight(value: number) {
  Object.defineProperty(window, 'innerHeight', { value, configurable: true });
}

function setDocumentHeight(value: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value, configurable: true });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.useFakeTimers();

  // Reset the module registry so scrollSession starts at zero for every test.
  vi.resetModules();

  const scrollModule = await import('../scrollData');
  initializeScrollListener = scrollModule.initializeScrollListener;

  // Get the fresh sendMessage spy created by the re-executed mock factory.
  const polyfill = await import('webextension-polyfill');
  sendMessage = vi.mocked(polyfill.runtime.sendMessage) as ReturnType<typeof vi.fn>;
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ status: 'success' });

  // With innerHeight=0 and documentHeight=1000: depth = scrollY / 10.
  // This keeps the math simple and the intent obvious in every test.
  setScrollY(0);
  setWindowHeight(0);
  setDocumentHeight(1000);

  // Capture the event handlers registered by initializeScrollListener.
  const spy = vi.spyOn(window, 'addEventListener');
  initializeScrollListener();

  scrollHandler = spy.mock.calls.find(c => c[0] === 'scroll')![1] as unknown as () => void;
  beforeunloadHandler = spy.mock.calls.find(c => c[0] === 'beforeunload')![1] as unknown as () => void;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Move the scroll position, fire the scroll handler, and flush the 300 ms debounce. */
function triggerScroll(scrollY: number) {
  setScrollY(scrollY);
  scrollHandler();
  vi.advanceTimersByTime(300);
}

// ─── initializeScrollListener ─────────────────────────────────────────────────

describe('initializeScrollListener', () => {
  it("registers a 'scroll' listener on window with { passive: true }", () => {
    const spy = vi.spyOn(window, 'addEventListener');
    initializeScrollListener();
    expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
  });

  it("registers a 'beforeunload' listener on window", () => {
    const spy = vi.spyOn(window, 'addEventListener');
    initializeScrollListener();
    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});

// ─── calculateScrollMetrics — scroll_depth_percentage ─────────────────────────

describe('calculateScrollMetrics — scroll_depth_percentage', () => {
  it('is 0% when at the top of the page (scrollY = 0)', () => {
    triggerScroll(0); // depth = 0 / 10 = 0%
    const metrics = sendMessage.mock.calls[0][0].data.scroll_metrics;
    expect(metrics.scroll_depth_percentage).toBe(0);
  });

  it('is 100% when at the bottom of the page (scrollY = documentHeight)', () => {
    triggerScroll(1000); // depth = 1000 / 10 = 100%
    const metrics = sendMessage.mock.calls[0][0].data.scroll_metrics;
    expect(metrics.scroll_depth_percentage).toBe(100);
  });
});

// ─── calculateScrollMetrics — reading_zone ────────────────────────────────────

describe('calculateScrollMetrics — reading_zone', () => {
  it("is 'header' when depth is less than 25%", () => {
    triggerScroll(240); // depth = 24%
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics.reading_zone).toBe('header');
  });

  it("is 'upper_content' when depth is >= 25% and < 50%", () => {
    triggerScroll(370); // depth = 37%
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics.reading_zone).toBe('upper_content');
  });

  it("is 'lower_content' when depth is >= 50% and < 75%", () => {
    triggerScroll(600); // depth = 60%
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics.reading_zone).toBe('lower_content');
  });

  it("is 'footer' when depth is >= 75%", () => {
    triggerScroll(800); // depth = 80%
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics.reading_zone).toBe('footer');
  });
});

// ─── calculateScrollMetrics — reached_bottom ──────────────────────────────────

describe('calculateScrollMetrics — reached_bottom', () => {
  it('is true when depth is exactly 95%', () => {
    triggerScroll(950); // depth = 95%
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics.reached_bottom).toBe(true);
  });

  it('is false when depth is below 95%', () => {
    triggerScroll(940); // depth = 94%
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics.reached_bottom).toBe(false);
  });
});

// ─── calculateScrollMetrics — accumulating state ─────────────────────────────

describe('calculateScrollMetrics — max_scroll_depth', () => {
  it('retains the highest depth seen across multiple scroll events', () => {
    triggerScroll(500); // depth = 50%, maxDepth → 50%
    triggerScroll(800); // depth = 80%, maxDepth → 80%
    triggerScroll(300); // depth = 30%, maxDepth stays at 80%

    const metrics = sendMessage.mock.calls[2][0].data.scroll_metrics; // third call
    expect(metrics.max_scroll_depth).toBe(80);
  });
});

describe('calculateScrollMetrics — total_scroll_distance', () => {
  it('accumulates absolute scroll distances across multiple events', () => {
    triggerScroll(300); // distance = |300 - 0|   = 300
    triggerScroll(100); // distance = |100 - 300| = 200
    triggerScroll(600); // distance = |600 - 100| = 500, total = 1000

    const metrics = sendMessage.mock.calls[2][0].data.scroll_metrics; // third call
    expect(metrics.total_scroll_distance).toBe(1000);
  });
});

// ─── sendScrollData — message shape ──────────────────────────────────────────

describe('sendScrollData — message shape', () => {
  it("sends a message with type 'SCROLL_EVENT'", () => {
    triggerScroll(200);
    expect(sendMessage.mock.calls[0][0].type).toBe('SCROLL_EVENT');
  });

  it('includes scroll_metrics in the message data', () => {
    triggerScroll(200);
    expect(sendMessage.mock.calls[0][0].data.scroll_metrics).toBeDefined();
  });
});

// ─── sendFinalScrollSummary ───────────────────────────────────────────────────

describe('sendFinalScrollSummary', () => {
  it("sends a 'SCROLL_FINAL' message on beforeunload when scroll events have occurred", () => {
    triggerScroll(500);     // creates one scroll event
    sendMessage.mockClear(); // discard the SCROLL_EVENT call

    beforeunloadHandler();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage.mock.calls[0][0].type).toBe('SCROLL_FINAL');
  });

  it('does not send a message on beforeunload when no scroll events have occurred', () => {
    // No triggerScroll → scrollEvents remains 0
    beforeunloadHandler();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('includes the correct engagement level in SCROLL_FINAL data', () => {
    triggerScroll(800); // maxDepth = 80% → engagement = 'high' (> 75)
    sendMessage.mockClear();

    beforeunloadHandler();

    const metrics = sendMessage.mock.calls[0][0].data.scroll_metrics;
    expect(metrics.engagement).toBe('high');
  });
});
