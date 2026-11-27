import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { createFreeboxRadioProvider, FREEBOX_MULTIPOSTE_M3U_URL } from './freebox-m3u';

const CUSTOM_PLAYLIST_URL_KEY = 'playlistUrl';

export const manifest: PluginManifest = {
  id: 'mplay3r.radio-freebox',
  name: 'Freebox Radios (Multiposte)',
  version: '1.0.0',
  description:
    'ISP box micro-plugin adding Freebox multiposte radio channels (and French public FM IP fallback streams) to the mPlay3r Radio plugin.',
  category: 'source',
  permissions: ['network', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const savedUrl = await ctx.storage.get<string>(CUSTOM_PLAYLIST_URL_KEY);
    const playlistUrl = typeof savedUrl === 'string' && savedUrl.trim() ? savedUrl.trim() : FREEBOX_MULTIPOSTE_M3U_URL;
    ctx.registerProvider(
      'radio',
      createFreeboxRadioProvider((input, init) => ctx.fetch(input, init), playlistUrl),
    );
  },
};

export default plugin;
