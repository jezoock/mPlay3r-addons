import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  applyPrismGlassTheme,
  mountPrismGlassLayout,
  PRISM_GLASS_CSS,
  PRISM_GLASS_THEME_ID,
  PRISM_GLASS_THEME_KEY,
} from './prism-glass';
import type { PrismGlassViewMode } from './prism-glass';

const VIEW_MODE_KEY = 'prismGlassView';

export const manifest: PluginManifest = {
  id: 'mplay3r.theme-prism-glass',
  name: 'Prism Glass Periwinkle Theme',
  version: '1.0.0',
  description:
    'Luminous periwinkle & orchid glassmorphism structural theme: frosted translucent cards with crisp white rims, squircle-in-squircle artwork frame, double-ring glass buttons, coral-red Play/Pause, white/coral-dot scrubber with remaining time (-m:ss), Collections strip, floating frosted mini-player, and frameless desktop drag support.',
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
    const saved = await ctx.storage.get<PrismGlassViewMode>(VIEW_MODE_KEY);
    let currentView: PrismGlassViewMode = saved === 'library' || saved === 'dual' ? saved : 'player';

    ctx.registerTheme({
      id: PRISM_GLASS_THEME_ID,
      name: 'Prism Glass Periwinkle',
      css: PRISM_GLASS_CSS,
      mountLayout: (container, target) =>
        mountPrismGlassLayout(ctx, container, target, {
          initialView: currentView,
          onViewChange: nextView => {
            currentView = nextView;
            void ctx.storage.set(VIEW_MODE_KEY, nextView);
          },
        }),
    });

    ctx.registerSlot({
      id: 'prism-glass-panel',
      slot: 'panel',
      title: 'Prism Glass',
      mount(container) {
        container.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
        const info = document.createElement('span');
        info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
        info.textContent = 'Prism Glass Periwinkle (Frosted Glassmorphism + Coral Accents)';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:0.4rem';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Apply Prism Glass';
        applyBtn.style.cssText =
          'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid #ef3e29;background:linear-gradient(135deg,#ff563a,#d52719);color:#ffffff;font-size:0.74rem;font-weight:700;cursor:pointer';
        applyBtn.addEventListener('click', () => applyPrismGlassTheme(ctx.playerTarget, PRISM_GLASS_THEME_KEY));

        const minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.textContent = 'Minimal';
        minBtn.style.cssText =
          'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
        minBtn.addEventListener('click', () => applyPrismGlassTheme(ctx.playerTarget, null));

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
