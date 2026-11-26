import { afterEach, beforeEach, vi } from 'vitest';

export function setupDOM(hostname: string): void {
  const observers: MutationObserver[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('location', { hostname, pathname: '/', href: `https://${hostname}/` });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const NativeObserver = MutationObserver;
    vi.stubGlobal(
      'MutationObserver',
      class extends NativeObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          observers.push(this);
        }
      },
    );
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(document, 'addEventListener');
  });
  afterEach(() => {
    for (const observer of observers.splice(0)) observer.disconnect();
    for (const [event, listener, options] of vi.mocked(window.addEventListener).mock.calls) {
      window.removeEventListener(event, listener, options);
    }
    for (const [event, listener, options] of vi.mocked(document.addEventListener).mock.calls) {
      document.removeEventListener(event, listener, options);
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });
}

export function fixture(html: string): HTMLElement {
  document.body.innerHTML = html;
  const element = document.body.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error('Fixture needs an HTML root');
  return element;
}
