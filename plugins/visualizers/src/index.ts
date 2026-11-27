import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { VisualizerEngine } from './renderers';
import type { CanvasLike, VisualizerMode } from './renderers';

export const manifest: PluginManifest = {
  id: 'mplay3r.visualizers',
  name: 'Audio Visualizers Pack',
  version: '1.0.0',
  description:
    'Lightweight audio-reactive visualizers powered by getAudioAnalyser(): Winamp spectrum analyzer with peak-hold, zero-crossing oscilloscope, WebGL GLSL shader, and fullscreen mode.',
  category: 'visualizer',
  permissions: ['audio-analyser', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

const VIS_STORAGE_MODE_KEY = 'visualizerMode';
let activeEngine: VisualizerEngine | null = null;

function readCssAccent(host: HTMLElement): string {
  if (typeof getComputedStyle !== 'function') return '#22d3ee';
  const raw = getComputedStyle(host).getPropertyValue('--ds-color-primary-base').trim();
  return /^#[0-9a-f]{3,6}$/i.test(raw) ? raw : '#22d3ee';
}

function visBtn(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.cssText = active
    ? 'padding:0.14rem 0.48rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.68rem;font-weight:700;cursor:pointer'
    : 'padding:0.14rem 0.48rem;border-radius:999px;border:1px solid var(--mp-border);background:rgba(0,0,0,0.35);color:var(--mp-text);font-size:0.68rem;cursor:pointer';
  btn.addEventListener('click', onClick);
  return btn;
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const savedMode = await ctx.storage.get<VisualizerMode>(VIS_STORAGE_MODE_KEY);
    const initialMode: VisualizerMode =
      savedMode === 'spectrum' || savedMode === 'oscilloscope' || savedMode === 'shader'
        ? savedMode
        : 'spectrum';

    const engine = new VisualizerEngine({ mode: initialMode, barCount: 28 });
    activeEngine = engine;

    const refreshAnalyser = async () => {
      try {
        const analyser = await ctx.getAudioAnalyser();
        engine.setAnalyser(analyser);
      } catch {
        // AudioContext may not be initialized until user playback starts.
      }
    };
    await refreshAnalyser();

    ctx.on('stateChange', () => {
      void refreshAnalyser();
    });

    ctx.on('paletteChange', () => {
      if (typeof document !== 'undefined') {
        const host = document.querySelector(ctx.playerTarget) as HTMLElement | null;
        if (host) engine.setPalette({ accent: readCssAccent(host) });
      }
    });

    ctx.registerSlot({
      id: 'visualizer-stage',
      slot: 'visualizer',
      title: 'Visualizer',
      mount(container) {
        container.innerHTML = '';

        const stage = document.createElement('div');
        stage.style.cssText =
          'position:relative;width:100%;height:110px;border-radius:8px;overflow:hidden;border:1px solid var(--mp-border);background:#0c0f15';

        let canvas = document.createElement('canvas');
        canvas.style.cssText = 'display:block;width:100%;height:100%';

        const toolbar = document.createElement('div');
        toolbar.style.cssText =
          'position:absolute;top:0.35rem;right:0.35rem;display:flex;gap:0.25rem;z-index:2';

        const syncCanvasSize = () => {
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
          engine.resize(stage.clientWidth || 320, stage.clientHeight || 110, dpr);
        };

        const switchMode = (nextMode: VisualizerMode) => {
          const prevWasShader = engine.getMode() === 'shader';
          const nextIsShader = nextMode === 'shader';
          // A single HTMLCanvasElement cannot switch between 2D and WebGL contexts; swap canvas cleanly.
          if (prevWasShader !== nextIsShader) {
            engine.unmount();
            const fresh = document.createElement('canvas');
            fresh.style.cssText = 'display:block;width:100%;height:100%';
            canvas.replaceWith(fresh);
            canvas = fresh;
            engine.setMode(nextMode);
            engine.mount(canvas as unknown as CanvasLike, {
              width: stage.clientWidth || 320,
              height: stage.clientHeight || 110,
              dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
            });
          } else {
            engine.setMode(nextMode);
          }
          void ctx.storage.set(VIS_STORAGE_MODE_KEY, nextMode);
          renderToolbar();
        };

        const renderToolbar = () => {
          toolbar.innerHTML = '';
          const mode = engine.getMode();
          toolbar.append(
            visBtn('Spectrum', mode === 'spectrum', () => switchMode('spectrum')),
            visBtn('Scope', mode === 'oscilloscope', () => switchMode('oscilloscope')),
            visBtn('WebGL', mode === 'shader', () => switchMode('shader')),
            visBtn('⛶', false, () => {
              if (typeof document !== 'undefined' && document.fullscreenElement) {
                void document.exitFullscreen?.();
              } else {
                void stage.requestFullscreen?.();
              }
            }),
          );
        };

        stage.append(canvas, toolbar);
        container.append(stage);
        renderToolbar();

        engine.setPalette({ accent: readCssAccent(stage) });
        engine.mount(canvas as unknown as CanvasLike, {
          width: stage.clientWidth || 320,
          height: stage.clientHeight || 110,
          dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        });

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => syncCanvasSize());
          ro.observe(stage);
        }

        return () => {
          ro?.disconnect();
          ro = null;
          engine.unmount();
          container.innerHTML = '';
        };
      },
    });
  },

  deactivate(): void {
    activeEngine?.unmount();
    activeEngine = null;
  },
};

export default plugin;
