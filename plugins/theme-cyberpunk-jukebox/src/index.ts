import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  applyCyberpunkTheme,
  CYBERPUNK_CSS,
  CYBERPUNK_THEME_ID,
  CYBERPUNK_THEME_KEY,
  mountCyberpunkJukeboxLayout,
} from './cyberpunk';

export const manifest: PluginManifest = {
  id: 'mplay3r.theme-cyberpunk-jukebox',
  name: 'Cyberpunk Neon Jukebox Theme',
  version: '1.0.0',
  description:
    'High-impact visual Cyberpunk Jukebox structural theme: glowing cyan/magenta neon arch, spinning holographic cyber-disc platter, live Canvas 2D FFT neon spectrum & CRT scanlines on getAudioAnalyser(), illuminated A1-D4 jukebox track selector grid, and frameless desktop drag support.',
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
      id: CYBERPUNK_THEME_ID,
      name: 'Cyberpunk Neon Jukebox',
      css: CYBERPUNK_CSS,
      mountLayout: (container, target) => mountCyberpunkJukeboxLayout(ctx, container, target),
    });

    ctx.registerSlot({
      id: 'cyberpunk-panel',
      slot: 'panel',
      title: 'Cyberpunk Jukebox',
      mount(container) {
        container.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
        const info = document.createElement('span');
        info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
        info.textContent = 'Cyberpunk Neon Jukebox 2099 (Holo-Disc + Live FFT + A1-D4 Grid)';

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:0.4rem';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Engage Jukebox';
        applyBtn.style.cssText =
          'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid #00f0ff;background:linear-gradient(90deg,#00f0ff,#ff2ebd);color:#060814;font-size:0.74rem;font-weight:800;cursor:pointer';
        applyBtn.addEventListener('click', () => applyCyberpunkTheme(ctx.playerTarget, CYBERPUNK_THEME_KEY));

        const minBtn = document.createElement('button');
        minBtn.type = 'button';
        minBtn.textContent = 'Minimal';
        minBtn.style.cssText =
          'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
        minBtn.addEventListener('click', () => applyCyberpunkTheme(ctx.playerTarget, null));

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
