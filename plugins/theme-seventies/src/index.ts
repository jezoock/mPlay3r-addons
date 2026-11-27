import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  applySeventiesTheme,
  mountSeventiesLayout,
  SEVENTIES_CSS,
  SEVENTIES_THEME_ID,
  SEVENTIES_THEME_KEY,
} from './seventies';

export const manifest: PluginManifest = {
  id: 'mplay3r.theme-seventies',
  name: 'Seventies Vintage Hi-Fi Theme',
  version: '1.0.0',
  description:
    '1970s vintage hi-fi stereo receiver structural theme: walnut woodgrain side cheeks, brushed champagne aluminum faceplate, dual glowing analog VU meter needles driven by getAudioAnalyser(), warm amber/turquoise tuning dial, and frameless desktop drag support.',
  category: 'theme',
  permissions: ['theme', 'ui-slot', 'audio-analyser', 'playback-control'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    ctx.registerTheme({
      id: SEVENTIES_THEME_ID,
      name: 'Seventies Vintage Hi-Fi',
      css: SEVENTIES_CSS,
      mountLayout: (container, target) => mountSeventiesLayout(ctx, container, target),
    });

    ctx.registerSlot({
      id: 'seventies-panel',
      slot: 'panel',
      title: 'Seventies Hi-Fi',
      mount(container) {
        container.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
        const info = document.createElement('span');
        info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
        info.textContent = '1970s Walnut & Champagne Receiver with Dual Analog VU Meters';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:0.4rem';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Apply Seventies Hi-Fi';
        applyBtn.style.cssText =
          'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.74rem;font-weight:700;cursor:pointer';
        applyBtn.addEventListener('click', () => applySeventiesTheme(ctx.playerTarget, SEVENTIES_THEME_KEY));

        const minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.textContent = 'Minimal';
        minBtn.style.cssText =
          'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
        minBtn.addEventListener('click', () => applySeventiesTheme(ctx.playerTarget, null));

        btns.append(applyBtn, minBtn);
        row.append(info, btns);
        container.append(row);
        return () => {
          container.innerHTML = '';
        };
      },
    });
  },
};

export default plugin;
