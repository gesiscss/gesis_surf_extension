import type { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { YouTubeShortsWavelet } from '../lib/content-script/wavelets/socials/YouTubeShortsWavelet';
import { messages } from './runtime-stub';

const probe = {
  start(config: SelectorConfig): void {
    new YouTubeShortsWavelet(config).initialize();
  },
  captures() {
    return messages.filter(message => message.type === 'YOUTUBE_SHORT').map(message => message.data);
  },
};

declare global {
  interface Window {
    shortsProbe: typeof probe;
  }
}

window.shortsProbe = probe;
