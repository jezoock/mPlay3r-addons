import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { DspEnhancerController } from './chain';
import type { DspAudioContextLike } from './chain';

export const manifest: PluginManifest = {
  id: 'mplay3r.dsp-enhancer',
  name: 'DSP Enhancer (Bass & Stereo Width)',
  version: '1.0.0',
  description:
    'Lightweight AudioWorklet DSP effect plugin chained onto getAudioContext(): harmonic Bass Enhancer, Mid/Side Stereo Widener, and lossless instant Bypass.',
  category: 'dsp',
  permissions: ['audio-context', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let activeDspController: DspEnhancerController | null = null;

function dspEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const controller = new DspEnhancerController(ctx.storage);
    activeDspController = controller;
    await controller.load();

    let rerender: (() => void) | null = null;

    const ensureAttached = async () => {
      try {
        const audioCtx = await ctx.getAudioContext();
        if (audioCtx) {
          await controller.attach(audioCtx as unknown as DspAudioContextLike);
          rerender?.();
        }
      } catch {
        // AudioContext initializes lazily on first playback.
      }
    };
    await ensureAttached();

    ctx.on('stateChange', () => {
      if (controller.getMode() === 'detached') {
        void ensureAttached();
      }
    });

    ctx.registerSlot({
      id: 'dsp-enhancer-panel',
      slot: 'panel',
      title: 'DSP FX',
      mount(container) {
        const renderPanel = () => {
          const p = controller.getParams();
          const mode = controller.getMode();
          container.innerHTML = '';

          const wrap = dspEl(
            'div',
            'display:flex;flex-direction:column;gap:0.55rem;padding:0.45rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)',
          );

          const header = dspEl('div', 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem');
          const modeLabel =
            mode === 'worklet'
              ? 'AudioWorklet active'
              : mode === 'biquad-fallback'
                ? 'Web Audio fallback'
                : 'Starts on playback';
          header.append(
            dspEl('span', 'font-size:0.78rem;font-weight:700', `Bass & Stereo DSP · ${modeLabel}`),
          );

          const actions = dspEl('div', 'display:flex;gap:0.3rem');
          const bypassBtn = dspEl(
            'button',
            p.enabled
              ? 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.71rem;font-weight:700;cursor:pointer'
              : 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text-muted);font-size:0.71rem;cursor:pointer',
            p.enabled ? 'Active' : 'Bypassed',
          );
          bypassBtn.type = 'button';
          bypassBtn.addEventListener('click', () => {
            void controller.toggleBypass().then(() => renderPanel());
          });

          const resetBtn = dspEl(
            'button',
            'padding:0.2rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer',
            'Reset',
          );
          resetBtn.type = 'button';
          resetBtn.addEventListener('click', () => {
            void controller.reset().then(() => renderPanel());
          });

          actions.append(bypassBtn, resetBtn);
          header.append(actions);

          const makeSliderRow = (
            label: string,
            min: number,
            max: number,
            step: number,
            value: number,
            formatVal: (v: number) => string,
            onChange: (v: number) => void,
          ) => {
            const row = dspEl('label', 'display:flex;align-items:center;gap:0.55rem;font-size:0.74rem');
            const nameEl = dspEl('span', 'width:6.8rem;color:var(--mp-text-muted)', label);
            const slider = dspEl('input', 'flex:1;accent-color:var(--ds-color-primary-base)');
            slider.type = 'range';
            slider.min = String(min);
            slider.max = String(max);
            slider.step = String(step);
            slider.value = String(value);
            slider.disabled = !p.enabled;
            const readout = dspEl('span', 'width:3.2rem;text-align:right;font-variant-numeric:tabular-nums', formatVal(value));
            slider.addEventListener('input', () => {
              const v = Number.parseFloat(slider.value);
              readout.textContent = formatVal(v);
              onChange(v);
            });
            row.append(nameEl, slider, readout);
            return row;
          };

          wrap.append(
            header,
            makeSliderRow(
              'Bass Enhancer',
              0,
              1,
              0.05,
              p.bassBoost,
              v => `${Math.round(v * 100)}%`,
              v => void controller.updateParams({ bassBoost: v }),
            ),
            makeSliderRow(
              'Stereo Width',
              0,
              2,
              0.05,
              p.stereoWidth,
              v => `${Math.round(v * 100)}%`,
              v => void controller.updateParams({ stereoWidth: v }),
            ),
          );

          container.append(wrap);
        };

        rerender = renderPanel;
        renderPanel();
        return () => {
          rerender = null;
          container.innerHTML = '';
        };
      },
    });
  },

  deactivate(): void {
    activeDspController?.detach();
    activeDspController = null;
  },
};

export default plugin;
