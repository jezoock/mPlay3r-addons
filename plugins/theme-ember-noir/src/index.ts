import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  applyEmberNoirTheme,
  EMBER_NOIR_CSS,
  EMBER_NOIR_THEME_ID,
  EMBER_NOIR_THEME_KEY,
  mountEmberNoirLayout,
} from './ember-noir';
import type { EmberNoirViewMode } from './ember-noir';

const VIEW_MODE_KEY = 'emberNoirView';
const FAVORITES_KEY = 'emberNoirFavorites';

export const manifest: PluginManifest = {
  id: 'mplay3r.theme-ember-noir',
  name: 'Ember Noir Dark Neumorph Theme',
  version: '1.0.0',
  description:
    'Ultra-sleek matte charcoal dark-neumorphic structural theme with fiery ember-orange Play/Pause button, obsidian smoldering-rose circular medallion, ember-to-gold scrubber with glowing amber dot, dual Now Playing / Tracklist views, favorites persistence, and frameless desktop drag support.',
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
    const savedView = await ctx.storage.get<EmberNoirViewMode>(VIEW_MODE_KEY);
    let currentView: EmberNoirViewMode =
      savedView === 'playlist' || savedView === 'dual' ? savedView : 'player';

    const savedFavs = await ctx.storage.get<string[]>(FAVORITES_KEY);
    let currentFavorites: string[] = Array.isArray(savedFavs)
      ? savedFavs.filter((id): id is string => typeof id === 'string')
      : [];

    ctx.registerTheme({
      id: EMBER_NOIR_THEME_ID,
      name: 'Ember Noir Dark Neumorph',
      css: EMBER_NOIR_CSS,
      mountLayout: (container, target) =>
        mountEmberNoirLayout(ctx, container, target, {
          initialView: currentView,
          initialFavorites: currentFavorites,
          onViewChange: nextView => {
            currentView = nextView;
            void ctx.storage.set(VIEW_MODE_KEY, nextView);
          },
          onFavoritesChange: nextFavs => {
            currentFavorites = nextFavs;
            void ctx.storage.set(FAVORITES_KEY, nextFavs);
          },
        }),
    });

    ctx.registerSlot({
      id: 'ember-noir-panel',
      slot: 'panel',
      title: 'Ember Noir',
      mount(container) {
        container.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
        const info = document.createElement('span');
        info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
        info.textContent = 'Ember Noir Dark Neumorph (Charcoal + Fiery Orange + Dual View)';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:0.4rem';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Apply Ember Noir';
        applyBtn.style.cssText =
          'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid #ff5b1f;background:linear-gradient(135deg,#ff5b1f,#d93000);color:#ffffff;font-size:0.74rem;font-weight:700;cursor:pointer';
        applyBtn.addEventListener('click', () => applyEmberNoirTheme(ctx.playerTarget, EMBER_NOIR_THEME_KEY));

        const minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.textContent = 'Minimal';
        minBtn.style.cssText =
          'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
        minBtn.addEventListener('click', () => applyEmberNoirTheme(ctx.playerTarget, null));

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
