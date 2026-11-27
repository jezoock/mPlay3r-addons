import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  applyNeumorphTheme,
  mountNeumorphLayout,
  NEUMORPH_CSS,
  NEUMORPH_THEME_ID,
  NEUMORPH_THEME_KEY,
  resetToMinimalTheme,
} from './neumorph';
import type { NeumorphMode } from './neumorph';

const NEUMORPH_MODE_KEY = 'neumorphMode';

export const manifest: PluginManifest = {
  id: 'mplay3r.theme-neumorph',
  name: 'Neumorphism Soft Studio Theme',
  version: '1.0.0',
  description:
    'Tactile soft-UI neumorphic structural theme with sculpted dual-shadow controls, concave LCD cavity, Porcelain Light / Graphite Dark toggle, <ds-trigger> controls, and frameless desktop drag support.',
  category: 'theme',
  permissions: ['theme', 'ui-slot', 'playback-control', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const saved = await ctx.storage.get<NeumorphMode>(NEUMORPH_MODE_KEY);
    let currentMode: NeumorphMode = saved === 'dark' ? 'dark' : 'light';

    ctx.registerTheme({
      id: NEUMORPH_THEME_ID,
      name: 'Soft Studio Neumorphism',
      css: NEUMORPH_CSS,
      mountLayout: (container, target) =>
        mountNeumorphLayout(ctx, container, target, currentMode, nextMode => {
          currentMode = nextMode;
          void ctx.storage.set(NEUMORPH_MODE_KEY, nextMode);
        }),
    });

    ctx.registerSlot({
      id: 'neumorph-panel',
      slot: 'panel',
      title: 'Neumorphism',
      mount(container) {
        container.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
        const info = document.createElement('span');
        info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
        info.textContent = 'Soft Studio Neumorphism (Porcelain Light / Graphite Dark)';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:0.4rem';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Apply Neumorphism';
        applyBtn.style.cssText =
          'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.74rem;font-weight:700;cursor:pointer';
        applyBtn.addEventListener('click', () => applyNeumorphTheme(ctx.playerTarget, NEUMORPH_THEME_KEY));

        const minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.textContent = 'Minimal';
        minBtn.style.cssText =
          'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
        minBtn.addEventListener('click', () => resetToMinimalTheme(ctx.playerTarget));

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
