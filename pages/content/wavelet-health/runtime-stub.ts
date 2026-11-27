import type { YouTubeShortsData } from '../lib/content-script/wavelets/socials/types';
import type { LLMData } from '@chrome-extension-boilerplate/shared/lib/types/contentScript';

export const messages: ({ type: 'YOUTUBE_SHORT'; data: YouTubeShortsData } | { type: 'LLM_MESSAGE'; data: LLMData })[] =
  [];

export const runtime = {
  async sendMessage(message: (typeof messages)[number]): Promise<void> {
    messages.push(message);
  },
};
