// @vitest-environment jsdom
//
// Full test coverage for pages/content/lib/content-script/clicks/clickData.ts
//
// Strategy: getClickType, getElementText, and getClassName are private functions.
// They are tested indirectly through logClickData by:
//   1. Spying on document.addEventListener to capture the registered handler.
//   2. Calling the handler directly with a plain mock event (isTrusted: true).
//   3. Inspecting the argument passed to runtime.sendMessage.
//
// initializeClickListener is the only exported function and is tested directly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runtime } from 'webextension-polyfill';

// Must be called before the module under test is imported so the mock is in
// place when clickData.ts runs `import { runtime } from 'webextension-polyfill'`.
vi.mock('webextension-polyfill', () => ({
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ status: 'success' }),
  },
}));

import { initializeClickListener } from '../clickData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal HTMLElement-shaped object.
 * Only the properties actually read by getElementText / getClassName need values.
 */
function makeTarget(props: {
  tagName: string;
  id?: string;
  innerText?: string;
  title?: string;
  className?: string | object;
  attrs?: Record<string, string | null>;
  // input
  value?: string;
  placeholder?: string;
  type?: string;
  // anchor
  href?: string;
  // img
  alt?: string;
  src?: string;
}): HTMLElement {
  return {
    tagName: props.tagName.toUpperCase(),
    id: props.id ?? '',
    innerText: props.innerText ?? '',
    title: props.title ?? '',
    className: props.className ?? '',
    getAttribute: (attr: string) => props.attrs?.[attr] ?? null,
    value: props.value ?? '',
    placeholder: props.placeholder ?? '',
    type: props.type ?? '',
    href: props.href ?? '',
    alt: props.alt ?? '',
    src: props.src ?? '',
  } as unknown as HTMLElement;
}

/** Build a MouseEvent-shaped object with isTrusted defaulting to true. */
function makeEvent(button: number, target: HTMLElement, trusted = true): MouseEvent {
  return {
    isTrusted: trusted,
    button,
    pageX: 100,
    pageY: 200,
    target,
  } as unknown as MouseEvent;
}

// A generic target used for tests that only care about click_type or message shape.
const genericTarget = makeTarget({
  tagName: 'DIV',
  id: 'main',
  innerText: 'hello',
  attrs: { class: 'container' },
});

// ─── Shared setup ─────────────────────────────────────────────────────────────
//
// Before each test:
//   - Clear call history on the sendMessage mock.
//   - Spy on document.addEventListener (without replacing the implementation so
//     jsdom still registers the real listener — but we extract the handler from
//     the spy calls so we can invoke it directly with a trusted mock event).
//   - Call initializeClickListener() to register the handlers.
//   - Extract the mousedown handler for use in logClickData tests.

let clickHandler: (e: MouseEvent) => void;

beforeEach(() => {
  vi.clearAllMocks();
  // vi.restoreAllMocks() in afterEach strips the mockResolvedValue implementation
  // from sendMessage (leaving it returning undefined). Re-establish it here so
  // every test gets a Promise back from sendMessage, not undefined.
  vi.mocked(runtime.sendMessage).mockResolvedValue({ status: 'success' });

  const spy = vi.spyOn(document, 'addEventListener');
  initializeClickListener();

  // Both 'contextmenu' and 'mousedown' map to the same logClickData function.
  // We use 'mousedown' as the canonical entry point for handler tests.
  const call = spy.mock.calls.find(c => c[0] === 'mousedown');
  clickHandler = call![1] as unknown as (e: MouseEvent) => void;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Dispatch a click through the captured handler and return the message arg. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dispatch(event: MouseEvent): any {
  clickHandler(event);
  return vi.mocked(runtime.sendMessage).mock.calls[0]?.[0];
}

// ─── initializeClickListener ──────────────────────────────────────────────────

describe('initializeClickListener', () => {
  it("registers 'contextmenu' listener on document with capture = true", () => {
    // The spy was called during beforeEach — re-spy and call again for a clean assertion.
    const spy = vi.spyOn(document, 'addEventListener');
    initializeClickListener();
    expect(spy).toHaveBeenCalledWith('contextmenu', expect.any(Function), true);
  });

  it("registers 'mousedown' listener on document with capture = true", () => {
    const spy = vi.spyOn(document, 'addEventListener');
    initializeClickListener();
    expect(spy).toHaveBeenCalledWith('mousedown', expect.any(Function), true);
  });
});

// ─── logClickData — isTrusted guard ───────────────────────────────────────────

describe('logClickData — isTrusted guard', () => {
  it('does not send a message when isTrusted is false', () => {
    clickHandler(makeEvent(0, genericTarget, false));
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
});

// ─── logClickData — message shape ─────────────────────────────────────────────

describe('logClickData — message shape', () => {
  it("sends a message with type 'CLICK_EVENT'", () => {
    const msg = dispatch(makeEvent(0, genericTarget));
    expect(msg.type).toBe('CLICK_EVENT');
  });

  it('includes pageX and pageY from the event', () => {
    const msg = dispatch(makeEvent(0, genericTarget));
    expect(msg.data.click_page_x).toBe(100);
    expect(msg.data.click_page_y).toBe(200);
  });

  it("sets click_referrer to 'no-referrer' when document.referrer is empty (jsdom default)", () => {
    // jsdom has no navigation history so document.referrer is '' by default.
    const msg = dispatch(makeEvent(0, genericTarget));
    expect(msg.data.click_referrer).toBe('no-referrer');
  });

  it('sets click_referrer from document.referrer when set', () => {
    Object.defineProperty(document, 'referrer', { value: 'https://google.com', configurable: true });
    const msg = dispatch(makeEvent(0, genericTarget));
    expect(msg.data.click_referrer).toBe('https://google.com');
    // Restore for subsequent tests.
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('sets domain_session_id to empty string', () => {
    const msg = dispatch(makeEvent(0, genericTarget));
    expect(msg.data.domain_session_id).toBe('');
  });

  it('sets click_target_tag to the lower-case tag name of the target', () => {
    const msg = dispatch(makeEvent(0, makeTarget({ tagName: 'BUTTON', innerText: 'OK' })));
    expect(msg.data.click_target_tag).toBe('button');
  });

  it('sets click_target_id from the target element id', () => {
    const msg = dispatch(makeEvent(0, makeTarget({ tagName: 'DIV', id: 'hero', innerText: 'x' })));
    expect(msg.data.click_target_id).toBe('hero');
  });

  it("sets click_target_id to 'unknown' when target has no id", () => {
    const msg = dispatch(makeEvent(0, makeTarget({ tagName: 'DIV', id: '', innerText: 'x' })));
    expect(msg.data.click_target_id).toBe('unknown');
  });
});

// ─── getClickType — tested indirectly via logClickData ───────────────────────

describe('getClickType (via logClickData)', () => {
  function clickType(button: number): string {
    return dispatch(makeEvent(button, genericTarget)).data.click_type;
  }

  it("returns 'left' for button 0", () => expect(clickType(0)).toBe('left'));
  it("returns 'middle' for button 1", () => expect(clickType(1)).toBe('middle'));
  it("returns 'right' for button 2", () => expect(clickType(2)).toBe('right'));
  it("returns 'right' for button -1 (contextmenu event)", () => expect(clickType(-1)).toBe('right'));
  it("returns 'unknown' for an unrecognized button value", () => expect(clickType(99)).toBe('unknown'));
});

// ─── getElementText — tested indirectly via logClickData ─────────────────────

describe('getElementText (via logClickData)', () => {
  function elementText(target: HTMLElement): string {
    return dispatch(makeEvent(0, target)).data.click_target_element;
  }

  // Tag-name placeholders
  it('returns <script> for SCRIPT element', () =>
    expect(elementText(makeTarget({ tagName: 'SCRIPT' }))).toBe('<script>'));

  it('returns <style> for STYLE element', () => expect(elementText(makeTarget({ tagName: 'STYLE' }))).toBe('<style>'));

  it('returns <svg> for SVG element', () => expect(elementText(makeTarget({ tagName: 'SVG' }))).toBe('<svg>'));

  it('returns <path> for PATH element', () => expect(elementText(makeTarget({ tagName: 'PATH' }))).toBe('<path>'));

  // Input element
  it('returns value for INPUT when value is set', () =>
    expect(elementText(makeTarget({ tagName: 'INPUT', value: 'hello' }))).toBe('hello'));

  it('returns placeholder for INPUT when no value', () =>
    expect(elementText(makeTarget({ tagName: 'INPUT', value: '', placeholder: 'Enter name' }))).toBe('Enter name'));

  it('returns type for INPUT when no value or placeholder', () =>
    expect(elementText(makeTarget({ tagName: 'INPUT', value: '', placeholder: '', type: 'checkbox' }))).toBe(
      'checkbox',
    ));

  // Button element
  it('returns trimmed innerText for BUTTON', () =>
    expect(elementText(makeTarget({ tagName: 'BUTTON', innerText: '  Submit  ' }))).toBe('Submit'));

  it('returns aria-label for BUTTON with no innerText', () =>
    expect(elementText(makeTarget({ tagName: 'BUTTON', innerText: '', attrs: { 'aria-label': 'Close' } }))).toBe(
      'Close',
    ));

  // Anchor element
  it('returns trimmed innerText for anchor', () =>
    expect(elementText(makeTarget({ tagName: 'A', innerText: ' Home ' }))).toBe('Home'));

  it('returns href for anchor with no innerText', () =>
    expect(elementText(makeTarget({ tagName: 'A', innerText: '', href: 'https://example.com' }))).toBe(
      'https://example.com',
    ));

  // Img element
  it('returns alt text for IMG', () => expect(elementText(makeTarget({ tagName: 'IMG', alt: 'A cat' }))).toBe('A cat'));

  it('returns src filename for IMG with no alt or title', () =>
    expect(
      elementText(makeTarget({ tagName: 'IMG', alt: '', title: '', src: 'https://cdn.example.com/photo.jpg' })),
    ).toBe('photo.jpg'));

  // Long text truncation
  it('truncates innerText longer than 255 chars and appends "..."', () => {
    const result = elementText(makeTarget({ tagName: 'DIV', innerText: 'a'.repeat(300) }));
    expect(result).toHaveLength(255);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns aria-label (up to 255 chars) when text is long and aria-label is present', () => {
    const result = elementText(
      makeTarget({ tagName: 'DIV', innerText: 'a'.repeat(300), attrs: { 'aria-label': 'Short label' } }),
    );
    expect(result).toBe('Short label');
  });

  // Fallback chain for generic elements
  it('returns aria-label for generic element with no innerText', () =>
    expect(elementText(makeTarget({ tagName: 'DIV', innerText: '', attrs: { 'aria-label': 'Main content' } }))).toBe(
      'Main content',
    ));

  it('returns title for generic element with no innerText or aria-label', () =>
    expect(elementText(makeTarget({ tagName: 'DIV', innerText: '', title: 'Tooltip' }))).toBe('Tooltip'));

  it('returns lower-case tag name as last-resort fallback', () =>
    expect(elementText(makeTarget({ tagName: 'SECTION', innerText: '' }))).toBe('section'));
});

// ─── getClassName — tested indirectly via logClickData ───────────────────────

describe('getClassName (via logClickData)', () => {
  function className(target: HTMLElement): string {
    return dispatch(makeEvent(0, target)).data.click_target_class;
  }

  it('returns the class attribute string when present', () =>
    expect(className(makeTarget({ tagName: 'DIV', attrs: { class: 'btn btn-primary' } }))).toBe('btn btn-primary'));

  it('returns className property when class attribute is absent but className is set', () =>
    expect(className(makeTarget({ tagName: 'DIV', className: 'my-class' }))).toBe('my-class'));

  it("returns 'no-class' when no class attribute and className is empty", () =>
    expect(className(makeTarget({ tagName: 'DIV', className: '' }))).toBe('no-class'));

  it("returns 'no-class' for SVG elements where className is an object (SVGAnimatedString)", () =>
    expect(className(makeTarget({ tagName: 'SVG', className: { baseVal: 'icon', animVal: 'icon' } }))).toBe(
      'no-class',
    ));
});