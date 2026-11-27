import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { BBOX_DEFAULT_M3U_URL, createBboxRadioProvider } from './bbox-m3u';

const BBOX_CUSTOM_URL_KEY = 'playlistUrl';

export const manifest: PluginManifest = {
  id: 'mplay3r.radio-bbox',
  name: 'Bbox Radios (Bouygues)',
  version: '1.0.0',
  description:
    'ISP box micro-plugin adding Bouygues Bbox local M3U radio bouquet (and French FM/DAB+ IP fallback streams) to the mPlay3r Radio plugin.',
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
    const savedUrl = await ctx.storage.get<string>(BBOX_CUSTOM_URL_KEY);
    const playlistUrl = typeof savedUrl === 'string' && savedUrl.trim() ? savedUrl.trim() : BBOX_DEFAULT_M3U_URL;
    ctx.registerProvider(
      'radio',
      createBboxRadioProvider((input, init) => ctx.fetch(input, init), playlistUrl),
    );
  },
};

export default plugin;
