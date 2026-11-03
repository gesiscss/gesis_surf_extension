import { runtime, windows } from 'webextension-polyfill';

export class LoginWindowService {
  private opening: Promise<void> | null = null;

  open(): Promise<void> {
    if (!this.opening) {
      this.opening = this.openOrFocus().finally(() => {
        this.opening = null;
      });
    }

    return this.opening;
  }

  /**
   * Closes every open login window. Called after a successful login, before
   * collection starts, so the login window is never recorded as browsing data.
   */
  async close(): Promise<void> {
    const loginWindows = await this.findLoginWindows();
    await Promise.all(loginWindows.flatMap(window => (window.id === undefined ? [] : [windows.remove(window.id)])));
  }

  private async findLoginWindows() {
    const url = runtime.getURL('popup/login.html');
    const openWindows = await windows.getAll({ populate: true, windowTypes: ['popup'] });
    return openWindows.filter(window => window.tabs?.some(tab => tab.url === url || tab.pendingUrl === url));
  }

  private async openOrFocus(): Promise<void> {
    const url = runtime.getURL('popup/login.html');
    const [existingWindow] = await this.findLoginWindows();

    if (existingWindow) {
      if (existingWindow.id === undefined) {
        throw new Error('The existing login window has no window ID.');
      }

      await windows.update(existingWindow.id, {
        focused: true,
        ...(existingWindow.state === 'minimized' ? { state: 'normal' } : {}),
      });
      return;
    }

    await windows.create({
      url,
      type: 'popup',
      width: 440,
      height: 680,
      focused: true,
    });
  }
}
