import { describe, expect, it, vi } from 'vitest';
import DomainEventManager from '../DomainEventManager';
import type { DomainDataTypes, DomainHandler, TabMapping } from '@root/lib/handlers';

vi.mock('@root/lib/handlers', () => ({}));
vi.mock('webextension-polyfill', () => ({ tabs: { sendMessage: vi.fn() } }));

const domainData = (status: string): DomainDataTypes => ({
  id: 5,
  favIconUrl: '',
  url: 'https://example.com',
  title: 'Example',
  lastAccessed: 0,
  windowId: 1,
  status,
});

const mapping = { id: '42' } as unknown as TabMapping;

describe('DomainEventManager', () => {
  it('sends a pending domain only once when completion events overlap', async () => {
    let finishSend!: () => void;
    const sendDomain = vi.fn(
      () =>
        new Promise<string>(resolve => {
          finishSend = () => resolve('domain-session');
        }),
    );
    const domainHandler = {
      registerPendingDomain: vi.fn(),
      cancelPendingDomain: vi.fn(),
      updateDomain: vi.fn(),
      sendDomain,
    } as unknown as DomainHandler;
    const manager = new DomainEventManager(domainHandler);

    await manager.handleDomainChange('domain-session', domainData('loading'), mapping);
    expect(sendDomain).not.toHaveBeenCalled();

    const first = manager.handleDomainChange('domain-session', domainData('complete'), mapping);
    const second = manager.handleDomainChange('domain-session', domainData('complete'), mapping);

    await vi.waitFor(() => expect(sendDomain).toHaveBeenCalledTimes(1));
    finishSend();
    await Promise.all([first, second]);

    expect(sendDomain).toHaveBeenCalledTimes(1);
    expect(manager.activeDomainSessionId).toBe('domain-session');
  });
});
