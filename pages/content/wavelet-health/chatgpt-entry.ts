import type { SelectorConfig } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';
import { ChatGPTWavelet } from '../lib/content-script/wavelets/llm/ChatGPTWavelet';
import { messages } from './runtime-stub';

const probe = {
  start(config: SelectorConfig): void {
    new ChatGPTWavelet(config).initialize();
  },
  captures() {
    return messages.filter(message => message.type === 'LLM_MESSAGE').map(message => message.data);
  },
};

declare global {
  interface Window {
    chatgptProbe: typeof probe;
  }
}

window.chatgptProbe = probe;
