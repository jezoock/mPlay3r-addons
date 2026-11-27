import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { resolveHostThemeAdapter, ThemeSwitchController } from './switcher';
import { HIFI_RACK_CSS, mountHifiRackLayout, mountWinampClassicLayout, WINAMP_CLASSIC_CSS } from './themes';

export const manifest: PluginManifest = {
  id: 'mplay3r.theme-classic',
  name: 'Structural Themes (Winamp Classic & Hi-Fi Rack)',
  version: '1.0.0',
  description:
    'Full-layout structural themes built with registerTheme() and <ds-trigger>: Winamp Classic 2.x deck and brushed Hi-Fi Rack component with zero-interruption hot switching.',
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
    const switcher = new ThemeSwitchController(ctx.storage, () => resolveHostThemeAdapter(ctx.playerTarget));

    const triggerSwitch = (key: string | null) => {
      void switcher.switchTo(key);
    };

    ctx.registerTheme({
      id: 'winamp-classic',
      name: 'Winamp Classic 2.x',
      css: WINAMP_CLASSIC_CSS,
      mountLayout: (container, target) => mountWinampClassicLayout(ctx, container, target, triggerSwitch),
    });

    ctx.registerTheme({
      id: 'hifi-rack',
      name: 'Hi-Fi Rack',
      css: HIFI_RACK_CSS,
      mountLayout: (container, target) => mountHifiRackLayout(ctx, container, target, triggerSwitch),
    });

    ctx.registerSlot({
      id: 'themes-switcher-panel',
      slot: 'panel',
      title: 'Themes',
      mount(container) {
        const render = () => {
          const current = switcher.getActiveThemeKey();
          container.innerHTML = '';

          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.45rem';

          const intro = document.createElement('div');
          intro.style.cssText = 'font-size:0.74rem;color:var(--mp-text-muted)';
          intro.textContent = 'Hot-switch full player layouts without interrupting audio playback:';
          wrap.append(intro);

          const choices: Array<[string | null, string, string]> = [
            [null, 'Minimal (Core Default)', 'Default lightweight 5-palette theme'],
            ['mplay3r.theme-classic:winamp-classic', 'Winamp Classic 2.x', 'Retro 275px beveled deck with green LCD & playlist'],
            ['mplay3r.theme-classic:hifi-rack', 'Hi-Fi Rack', 'Brushed gunmetal horizontal stereo deck with VFD display'],
          ];

          for (const [key, title, desc] of choices) {
            const active = current === key;
            const row = document.createElement('div');
            row.style.cssText =
              'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.4rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
            const meta = document.createElement('div');
            const t = document.createElement('div');
            t.style.cssText = 'font-size:0.79rem;font-weight:600';
            t.textContent = title;
            const d = document.createElement('div');
            d.style.cssText = 'font-size:0.69rem;color:var(--mp-text-muted)';
            d.textContent = desc;
            meta.append(t, d);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = active ? 'Active ✓' : 'Apply';
            btn.style.cssText = active
              ? 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.71rem;font-weight:700;cursor:pointer'
              : 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer';
            btn.addEventListener('click', () => {
              void switcher.switchTo(key).then(() => render());
            });

            row.append(meta, btn);
            wrap.append(row);
          }

          container.append(wrap);
        };

        render();
        return () => {
          container.innerHTML = '';
        };
      },
    });

    await switcher.load();
  },
};

export default plugin;
