import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { loadWszSkin, mountWszSkinLayout } from './sprites';
import type { LoadedWszSkin } from './sprites';

export const manifest: PluginManifest = {
  id: 'mplay3r.wsz-skins',
  name: 'Winamp .wsz Skin Loader',
  version: '1.0.0',
  description:
    'Import classic Winamp .wsz skin archives (local file or URL), extract BMP sprites (main.bmp, cbuttons.bmp, eqmain.bmp), parse pledit.txt & viscolor.txt, and render an interactive <ds-trigger> skinned deck.',
  category: 'theme',
  permissions: ['theme', 'ui-slot', 'network', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let activeWszSkin: LoadedWszSkin | null = null;

async function applyWszThemeKey(playerTarget: string, themeKey: string | null): Promise<void> {
  if (typeof document === 'undefined' || !playerTarget) return;
  const hostEl = document.querySelector(playerTarget) as
    | (HTMLElement & { getPluginHost?: () => Promise<{ setActiveTheme(key: string | null): void }> })
    | null;
  if (!hostEl || typeof hostEl.getPluginHost !== 'function') return;
  const host = await hostEl.getPluginHost();
  host.setActiveTheme(themeKey);
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    let loadedSkin: LoadedWszSkin | null = null;
    let statusMessage = 'Drop or select a local .wsz archive (or paste a skin URL) to skin mPlay3r.';
    let skinUrlDraft = '';

    const setLoadedSkin = (next: LoadedWszSkin) => {
      loadedSkin?.dispose();
      loadedSkin = next;
      activeWszSkin = next;
    };

    ctx.registerTheme({
      id: 'wsz-active',
      name: 'Winamp .wsz Skin',
      mountLayout: (container, target) => {
        if (!loadedSkin || !loadedSkin.ok) {
          container.textContent = 'No .wsz skin loaded yet.';
          return () => {
            container.innerHTML = '';
          };
        }
        return mountWszSkinLayout(loadedSkin, ctx, container, target, () => {
          void applyWszThemeKey(target, null);
        });
      },
    });

    ctx.registerSlot({
      id: 'wsz-skins-panel',
      slot: 'panel',
      title: 'Winamp .wsz',
      mount(container) {
        const importBytes = async (bytes: Uint8Array, name: string) => {
          const parsed = await loadWszSkin(bytes, name);
          if (!parsed.ok) {
            parsed.dispose();
            statusMessage = parsed.error || 'Failed to load .wsz archive.';
            await ctx.notify(statusMessage, 'error');
            renderPanel();
            return;
          }
          setLoadedSkin(parsed);
          statusMessage = `Loaded "${parsed.name}" (${Object.keys(parsed.sprites).length} BMP sprites)`;
          await applyWszThemeKey(ctx.playerTarget, 'mplay3r.wsz-skins:wsz-active');
          await ctx.notify(`Applied Winamp skin: ${parsed.name}`, 'success');
          renderPanel();
        };

        const renderPanel = () => {
          container.innerHTML = '';
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.45rem';

          const fileRow = document.createElement('div');
          fileRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center';

          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = '.wsz,.zip';
          fileInput.style.cssText = 'font-size:0.74rem;color:var(--mp-text)';
          fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            void file.arrayBuffer().then(buf => importBytes(new Uint8Array(buf), file.name));
          });

          const exitBtn = document.createElement('button');
          exitBtn.type = 'button';
          exitBtn.textContent = 'Return to Minimal';
          exitBtn.style.cssText =
            'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer';
          exitBtn.addEventListener('click', () => void applyWszThemeKey(ctx.playerTarget, null));

          fileRow.append(fileInput, exitBtn);

          const urlForm = document.createElement('form');
          urlForm.style.cssText = 'display:flex;gap:0.35rem';
          const urlIn = document.createElement('input');
          urlIn.type = 'url';
          urlIn.placeholder = 'https://…/skin.wsz URL';
          urlIn.value = skinUrlDraft;
          urlIn.style.cssText =
            'flex:1;padding:0.26rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.75rem';
          urlIn.addEventListener('input', () => {
            skinUrlDraft = urlIn.value;
          });
          const fetchBtn = document.createElement('button');
          fetchBtn.type = 'submit';
          fetchBtn.textContent = 'Load URL';
          fetchBtn.style.cssText =
            'padding:0.26rem 0.6rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer';
          urlForm.addEventListener('submit', event => {
            event.preventDefault();
            const raw = skinUrlDraft.trim();
            if (!/^https?:\/\/\S+/i.test(raw)) return;
            void (async () => {
              try {
                const res = await ctx.fetch(raw);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buf = await res.arrayBuffer();
                const name = raw.split('/').pop() || 'Remote .wsz';
                await importBytes(new Uint8Array(buf), name);
              } catch (err) {
                statusMessage = err instanceof Error ? err.message : 'Unable to download .wsz skin.';
                await ctx.notify(statusMessage, 'error');
                renderPanel();
              }
            })();
          });
          urlForm.append(urlIn, fetchBtn);

          const statusEl = document.createElement('div');
          statusEl.style.cssText = 'font-size:0.72rem;color:var(--mp-text-muted)';
          statusEl.textContent = statusMessage;

          wrap.append(fileRow, urlForm, statusEl);

          if (loadedSkin && loadedSkin.ok) {
            const info = document.createElement('div');
            info.style.cssText =
              'padding:0.4rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);font-size:0.71rem;display:flex;flex-direction:column;gap:0.25rem';
            const spriteNames = Object.keys(loadedSkin.sprites);
            const summary = document.createElement('div');
            summary.textContent = `Sprites: ${spriteNames.length > 0 ? spriteNames.join(', ') : 'none'} · Font: ${loadedSkin.pledit.font}`;
            info.append(summary);

            if (loadedSkin.warnings.length > 0) {
              const warn = document.createElement('div');
              warn.style.color = 'var(--mp-text-muted)';
              warn.textContent = `Notes: ${loadedSkin.warnings.join(' | ')}`;
              info.append(warn);
            }
            wrap.append(info);
          }

          container.append(wrap);
        };

        renderPanel();
        return () => {
          container.innerHTML = '';
        };
      },
    });
  },

  deactivate(): void {
    activeWszSkin?.dispose();
    activeWszSkin = null;
  },
};

export default plugin;
