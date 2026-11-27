// mPlay3r addon bundle: mplay3r.dsp-enhancer@1.0.0 (generated from plugins/dsp-enhancer/src)

const DSP_WORKLET_NAME = 'mplay3r-dsp-enhancer';
const DEFAULT_DSP_PARAMS = {
    enabled: true,
    bassBoost: 0.35,
    stereoWidth: 1.25
};
function clampDspParams(raw) {
    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_DSP_PARAMS.enabled;
    const bassBoost = typeof raw.bassBoost === 'number' && Number.isFinite(raw.bassBoost) ? Math.min(1, Math.max(0, Math.round(raw.bassBoost * 100) / 100)) : DEFAULT_DSP_PARAMS.bassBoost;
    const stereoWidth = typeof raw.stereoWidth === 'number' && Number.isFinite(raw.stereoWidth) ? Math.min(2, Math.max(0, Math.round(raw.stereoWidth * 100) / 100)) : DEFAULT_DSP_PARAMS.stereoWidth;
    return {
        enabled,
        bassBoost,
        stereoWidth
    };
}
function softClipSample(x) {
    return x / (1 + Math.abs(x) * 0.35);
}
function processDspStereoBlock(inL, inR, outL, outR, params, sampleRate = 48000, memory = {
    lpL: 0,
    lpR: 0
}) {
    const len = Math.min(inL.length, inR.length, outL.length, outR.length);
    if (!params.enabled) {
        for(let i = 0; i < len; i += 1){
            outL[i] = inL[i];
            outR[i] = inR[i];
        }
        return memory;
    }
    const cutoffHz = 120;
    const alpha = Math.min(0.5, 2 * Math.PI * cutoffHz / Math.max(8000, sampleRate));
    const bassAmt = Math.min(1, Math.max(0, params.bassBoost));
    const width = Math.min(2, Math.max(0, params.stereoWidth));
    let lpL = memory.lpL;
    let lpR = memory.lpR;
    for(let i = 0; i < len; i += 1){
        const l = inL[i];
        const r = inR[i];
        lpL += alpha * (l - lpL);
        lpR += alpha * (r - lpR);
        const excL = bassAmt > 0 ? Math.tanh(lpL * (1.8 + bassAmt * 1.4)) * bassAmt * 0.55 : 0;
        const excR = bassAmt > 0 ? Math.tanh(lpR * (1.8 + bassAmt * 1.4)) * bassAmt * 0.55 : 0;
        const bL = l + excL;
        const bR = r + excR;
        const mid = 0.5 * (bL + bR);
        const side = 0.5 * (bL - bR) * width;
        outL[i] = Math.max(-1, Math.min(1, softClipSample(mid + side)));
        outR[i] = Math.max(-1, Math.min(1, softClipSample(mid - side)));
    }
    memory.lpL = lpL;
    memory.lpR = lpR;
    return memory;
}
const DSP_WORKLET_SOURCE = `
class MPlay3rDspEnhancerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bypass', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'bassBoost', defaultValue: 0.35, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'stereoWidth', defaultValue: 1.25, minValue: 0, maxValue: 2, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.lpL = 0;
    this.lpR = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0 || output.length === 0) return true;
    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const bypass = (parameters.bypass && parameters.bypass[0]) >= 0.5;
    if (bypass) {
      outL.set(inL);
      if (outR !== outL) outR.set(inR);
      return true;
    }
    const bassAmt = parameters.bassBoost ? parameters.bassBoost[0] : 0.35;
    const width = parameters.stereoWidth ? parameters.stereoWidth[0] : 1.25;
    const alpha = Math.min(0.5, (2 * Math.PI * 120) / Math.max(8000, sampleRate));
    let lpL = this.lpL;
    let lpR = this.lpR;
    for (let i = 0; i < inL.length; i += 1) {
      const l = inL[i];
      const r = inR[i];
      lpL += alpha * (l - lpL);
      lpR += alpha * (r - lpR);
      const bL = l + (bassAmt > 0 ? Math.tanh(lpL * (1.8 + bassAmt * 1.4)) * bassAmt * 0.55 : 0);
      const bR = r + (bassAmt > 0 ? Math.tanh(lpR * (1.8 + bassAmt * 1.4)) * bassAmt * 0.55 : 0);
      const mid = 0.5 * (bL + bR);
      const side = 0.5 * (bL - bR) * width;
      const yL = mid + side;
      const yR = mid - side;
      outL[i] = Math.max(-1, Math.min(1, yL / (1 + Math.abs(yL) * 0.35)));
      if (outR !== outL) outR[i] = Math.max(-1, Math.min(1, yR / (1 + Math.abs(yR) * 0.35)));
    }
    this.lpL = lpL;
    this.lpR = lpR;
    return true;
  }
}
registerProcessor('${DSP_WORKLET_NAME}', MPlay3rDspEnhancerProcessor);
`;

const DSP_STORAGE_KEY = 'dspEnhancerParams';
class DspEnhancerController {
    storage;
    createWorkletNode;
    params = {
        ...DEFAULT_DSP_PARAMS
    };
    mode = 'detached';
    audioCtx = null;
    workletNode = null;
    fallbackFilter = null;
    constructor(storage, options = {}){
        this.storage = storage;
        this.createWorkletNode = options.createWorkletNode ?? ((ctx, name)=>{
            if (typeof AudioWorkletNode === 'undefined') {
                throw new Error('AudioWorkletNode constructor unavailable');
            }
            return new AudioWorkletNode(ctx, name);
        });
    }
    async load() {
        const saved = await this.storage.get(DSP_STORAGE_KEY);
        if (saved && typeof saved === 'object') {
            this.params = clampDspParams(saved);
        }
        return this.getParams();
    }
    getParams() {
        return {
            ...this.params
        };
    }
    getMode() {
        return this.mode;
    }
    getActiveNode() {
        return this.workletNode ?? this.fallbackFilter;
    }
    async attach(audioCtx) {
        if (this.audioCtx === audioCtx && this.mode !== 'detached') {
            this.syncNodeParameters();
            return this.mode;
        }
        this.detach();
        this.audioCtx = audioCtx;
        if (audioCtx.audioWorklet && typeof audioCtx.audioWorklet.addModule === 'function') {
            let blobUrl = null;
            try {
                if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                    blobUrl = URL.createObjectURL(new Blob([
                        DSP_WORKLET_SOURCE
                    ], {
                        type: 'application/javascript'
                    }));
                    await audioCtx.audioWorklet.addModule(blobUrl);
                } else {
                    await audioCtx.audioWorklet.addModule(`data:application/javascript,${encodeURIComponent(DSP_WORKLET_SOURCE)}`);
                }
                this.workletNode = this.createWorkletNode(audioCtx, DSP_WORKLET_NAME);
                this.mode = 'worklet';
                this.syncNodeParameters();
                return this.mode;
            } catch  {
                this.workletNode = null;
            } finally{
                if (blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                    URL.revokeObjectURL(blobUrl);
                }
            }
        }
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowshelf';
        filter.frequency.value = 120;
        this.fallbackFilter = filter;
        this.mode = 'biquad-fallback';
        this.syncNodeParameters();
        return this.mode;
    }
    async updateParams(patch) {
        this.params = clampDspParams({
            ...this.params,
            ...patch
        });
        this.syncNodeParameters();
        await this.storage.set(DSP_STORAGE_KEY, this.params);
        return this.getParams();
    }
    async setEnabled(enabled) {
        return this.updateParams({
            enabled
        });
    }
    async toggleBypass() {
        return this.setEnabled(!this.params.enabled);
    }
    async reset() {
        return this.updateParams({
            ...DEFAULT_DSP_PARAMS
        });
    }
    syncNodeParameters() {
        const now = this.audioCtx?.currentTime ?? 0;
        if (this.workletNode) {
            const setParam = (name, val)=>{
                const param = this.workletNode?.parameters.get(name);
                if (!param) return;
                if (typeof param.setValueAtTime === 'function') param.setValueAtTime(val, now);
                else param.value = val;
            };
            setParam('bypass', this.params.enabled ? 0 : 1);
            setParam('bassBoost', this.params.bassBoost);
            setParam('stereoWidth', this.params.stereoWidth);
            return;
        }
        if (this.fallbackFilter) {
            const dbGain = this.params.enabled ? this.params.bassBoost * 9 : 0;
            if (typeof this.fallbackFilter.gain.setValueAtTime === 'function') {
                this.fallbackFilter.gain.setValueAtTime(dbGain, now);
            } else {
                this.fallbackFilter.gain.value = dbGain;
            }
        }
    }
    detach() {
        try {
            this.workletNode?.disconnect();
        } catch  {}
        try {
            this.fallbackFilter?.disconnect();
        } catch  {}
        this.workletNode = null;
        this.fallbackFilter = null;
        this.audioCtx = null;
        this.mode = 'detached';
    }
}

export const manifest = {
    id: 'mplay3r.dsp-enhancer',
    name: 'DSP Enhancer (Bass & Stereo Width)',
    version: '1.0.0',
    description: 'Lightweight AudioWorklet DSP effect plugin chained onto getAudioContext(): harmonic Bass Enhancer, Mid/Side Stereo Widener, and lossless instant Bypass.',
    category: 'dsp',
    permissions: [
        'audio-context',
        'ui-slot',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
let activeDspController = null;
function dspEl(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const controller = new DspEnhancerController(ctx.storage);
        activeDspController = controller;
        await controller.load();
        let rerender = null;
        const ensureAttached = async ()=>{
            try {
                const audioCtx = await ctx.getAudioContext();
                if (audioCtx) {
                    await controller.attach(audioCtx);
                    rerender?.();
                }
            } catch  {}
        };
        await ensureAttached();
        ctx.on('stateChange', ()=>{
            if (controller.getMode() === 'detached') {
                void ensureAttached();
            }
        });
        ctx.registerSlot({
            id: 'dsp-enhancer-panel',
            slot: 'panel',
            title: 'DSP FX',
            mount (container) {
                const renderPanel = ()=>{
                    const p = controller.getParams();
                    const mode = controller.getMode();
                    container.innerHTML = '';
                    const wrap = dspEl('div', 'display:flex;flex-direction:column;gap:0.55rem;padding:0.45rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)');
                    const header = dspEl('div', 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem');
                    const modeLabel = mode === 'worklet' ? 'AudioWorklet active' : mode === 'biquad-fallback' ? 'Web Audio fallback' : 'Starts on playback';
                    header.append(dspEl('span', 'font-size:0.78rem;font-weight:700', `Bass & Stereo DSP · ${modeLabel}`));
                    const actions = dspEl('div', 'display:flex;gap:0.3rem');
                    const bypassBtn = dspEl('button', p.enabled ? 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.71rem;font-weight:700;cursor:pointer' : 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text-muted);font-size:0.71rem;cursor:pointer', p.enabled ? 'Active' : 'Bypassed');
                    bypassBtn.type = 'button';
                    bypassBtn.addEventListener('click', ()=>{
                        void controller.toggleBypass().then(()=>renderPanel());
                    });
                    const resetBtn = dspEl('button', 'padding:0.2rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer', 'Reset');
                    resetBtn.type = 'button';
                    resetBtn.addEventListener('click', ()=>{
                        void controller.reset().then(()=>renderPanel());
                    });
                    actions.append(bypassBtn, resetBtn);
                    header.append(actions);
                    const makeSliderRow = (label, min, max, step, value, formatVal, onChange)=>{
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
                        slider.addEventListener('input', ()=>{
                            const v = Number.parseFloat(slider.value);
                            readout.textContent = formatVal(v);
                            onChange(v);
                        });
                        row.append(nameEl, slider, readout);
                        return row;
                    };
                    wrap.append(header, makeSliderRow('Bass Enhancer', 0, 1, 0.05, p.bassBoost, (v)=>`${Math.round(v * 100)}%`, (v)=>void controller.updateParams({
                            bassBoost: v
                        })), makeSliderRow('Stereo Width', 0, 2, 0.05, p.stereoWidth, (v)=>`${Math.round(v * 100)}%`, (v)=>void controller.updateParams({
                            stereoWidth: v
                        })));
                    container.append(wrap);
                };
                rerender = renderPanel;
                renderPanel();
                return ()=>{
                    rerender = null;
                    container.innerHTML = '';
                };
            }
        });
    },
    deactivate () {
        activeDspController?.detach();
        activeDspController = null;
    }
};
export default plugin;
