// mPlay3r addon bundle: mplay3r.visualizers@1.0.0 (generated from plugins/visualizers/src)

function createSpectrumState(barCount = 24) {
    const count = Math.max(4, Math.min(128, Math.floor(barCount)));
    return {
        barCount: count,
        bars: new Float32Array(count),
        peaks: new Float32Array(count),
        peakHoldFrames: new Uint16Array(count)
    };
}
function computeLogFrequencyBands(fftBytes, barCount, out = new Float32Array(barCount)) {
    const count = Math.max(1, barCount);
    if (fftBytes.length === 0) {
        out.fill(0);
        return out;
    }
    const usableBins = Math.max(1, Math.floor(fftBytes.length * 0.85));
    const minBin = 1;
    const maxBin = Math.max(minBin + 1, usableBins);
    const ratio = maxBin / minBin;
    for(let i = 0; i < count; i += 1){
        const startF = minBin * Math.pow(ratio, i / count);
        const endF = minBin * Math.pow(ratio, (i + 1) / count);
        const startIdx = Math.min(fftBytes.length - 1, Math.max(0, Math.floor(startF) - 1));
        const endIdx = Math.min(fftBytes.length, Math.max(startIdx + 1, Math.ceil(endF)));
        let sum = 0;
        let peak = 0;
        for(let b = startIdx; b < endIdx; b += 1){
            const val = fftBytes[b] / 255;
            sum += val;
            if (val > peak) peak = val;
        }
        const avg = sum / (endIdx - startIdx);
        out[i] = Math.min(1, Math.max(0, avg * 0.55 + peak * 0.45));
    }
    return out;
}
function stepSpectrumState(state, targetLevels, options = {}) {
    const rise = Math.min(1, Math.max(0.05, options.riseSmoothing ?? 0.65));
    const barDecay = Math.max(0.001, options.barDecay ?? 0.045);
    const peakHold = Math.max(0, Math.floor(options.peakHold ?? 14));
    const peakDecay = Math.max(0.001, options.peakDecay ?? 0.018);
    const len = Math.min(state.barCount, targetLevels.length);
    for(let i = 0; i < len; i += 1){
        const raw = targetLevels[i];
        const target = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
        const prevBar = state.bars[i];
        const nextBar = target >= prevBar ? prevBar + (target - prevBar) * rise : Math.max(target, prevBar - barDecay);
        state.bars[i] = Math.min(1, Math.max(0, nextBar));
        if (state.bars[i] >= state.peaks[i]) {
            state.peaks[i] = state.bars[i];
            state.peakHoldFrames[i] = peakHold;
        } else if (state.peakHoldFrames[i] > 0) {
            state.peakHoldFrames[i] -= 1;
        } else {
            state.peaks[i] = Math.max(state.bars[i], state.peaks[i] - peakDecay);
        }
    }
    return state;
}
function computeAudioEnergy(fftBytes) {
    const n = fftBytes.length;
    if (n === 0) {
        return {
            bass: 0,
            mid: 0,
            treble: 0,
            rms: 0
        };
    }
    const bassEnd = Math.max(1, Math.floor(n * 0.1));
    const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.4));
    const trebleEnd = Math.max(midEnd + 1, Math.floor(n * 0.85));
    const avgSlice = (from, to)=>{
        let sum = 0;
        for(let i = from; i < to; i += 1)sum += fftBytes[i] / 255;
        return sum / Math.max(1, to - from);
    };
    let sqSum = 0;
    for(let i = 0; i < n; i += 1){
        const v = fftBytes[i] / 255;
        sqSum += v * v;
    }
    return {
        bass: avgSlice(0, bassEnd),
        mid: avgSlice(bassEnd, midEnd),
        treble: avgSlice(midEnd, trebleEnd),
        rms: Math.sqrt(sqSum / n)
    };
}
function downsampleWaveform(timeDomainBytes, sampleCount, out = new Float32Array(sampleCount)) {
    const count = Math.max(2, sampleCount);
    const n = timeDomainBytes.length;
    if (n === 0) {
        out.fill(0);
        return out;
    }
    let start = 0;
    const searchLimit = Math.floor(n / 2);
    for(let i = 1; i < searchLimit; i += 1){
        if (timeDomainBytes[i - 1] < 128 && timeDomainBytes[i] >= 128) {
            start = i;
            break;
        }
    }
    const windowLen = Math.max(1, n - start);
    for(let i = 0; i < count; i += 1){
        const idx = Math.min(n - 1, start + Math.floor(i / (count - 1) * (windowLen - 1)));
        out[i] = (timeDomainBytes[idx] - 128) / 128;
    }
    return out;
}

const DEFAULT_VIS_PALETTE = {
    bg: '#0c0f15',
    accent: '#22d3ee',
    peak: '#f8fafc',
    grid: 'rgba(255,255,255,0.08)'
};
const VERTEX_SHADER_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
const FRAGMENT_SHADER_SRC = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec3 u_accent;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);
  float wave = sin(dist * (14.0 + u_mid * 10.0) - u_time * 3.2 + sin(angle * 4.0 + u_time) * (0.35 + u_treble));
  float ring = smoothstep(0.18 + u_bass * 0.24, 0.02, abs(dist - (0.24 + u_bass * 0.16 + wave * 0.04)));
  float glow = exp(-dist * (3.2 - u_bass * 1.4)) * (0.25 + u_mid * 0.85);
  vec3 col = mix(vec3(0.05, 0.07, 0.11), u_accent, clamp(ring + glow, 0.0, 1.0));
  col += vec3(0.95, 0.98, 1.0) * ring * (0.25 + u_treble * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;
function parseHexColorRgb(hex) {
    const clean = (hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(clean)) {
        return [
            Number.parseInt(clean.slice(0, 2), 16) / 255,
            Number.parseInt(clean.slice(2, 4), 16) / 255,
            Number.parseInt(clean.slice(4, 6), 16) / 255
        ];
    }
    if (/^[0-9a-f]{3}$/i.test(clean)) {
        return [
            Number.parseInt(clean[0] + clean[0], 16) / 255,
            Number.parseInt(clean[1] + clean[1], 16) / 255,
            Number.parseInt(clean[2] + clean[2], 16) / 255
        ];
    }
    return [
        0.13,
        0.83,
        0.93
    ];
}
function renderSpectrum2D(ctx, width, height, state, palette) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);
    const pad = 6;
    const innerW = Math.max(1, width - pad * 2);
    const innerH = Math.max(1, height - pad * 2);
    const gap = Math.max(1, Math.floor(innerW / (state.barCount * 5)));
    const barW = Math.max(2, (innerW - gap * (state.barCount - 1)) / state.barCount);
    const segments = Math.max(8, Math.min(24, Math.floor(innerH / 5)));
    const segGap = 1.5;
    const segH = Math.max(1.5, (innerH - segGap * (segments - 1)) / segments);
    for(let i = 0; i < state.barCount; i += 1){
        const x = pad + i * (barW + gap);
        const activeSegs = Math.round(state.bars[i] * segments);
        for(let s = 0; s < activeSegs; s += 1){
            const ratio = s / Math.max(1, segments - 1);
            if (ratio > 0.82) ctx.fillStyle = '#ef4444';
            else if (ratio > 0.58) ctx.fillStyle = '#f59e0b';
            else ctx.fillStyle = palette.accent;
            const y = pad + innerH - (s + 1) * segH - s * segGap;
            ctx.fillRect(x, y, barW, segH);
        }
        const peakVal = state.peaks[i];
        if (peakVal > 0.01) {
            const peakY = pad + innerH - peakVal * innerH;
            ctx.fillStyle = palette.peak;
            ctx.fillRect(x, Math.max(pad, peakY - 2), barW, 2);
        }
    }
}
function renderOscilloscope2D(ctx, width, height, waveform, palette) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);
    const midY = height / 2;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    if (waveform.length < 2) return;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const amp = height * 0.42;
    for(let i = 0; i < waveform.length; i += 1){
        const x = i / (waveform.length - 1) * width;
        const y = midY - waveform[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}
function renderFallbackWaves2D(ctx, width, height, energy, timeSec, palette) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.44;
    for(let ring = 0; ring < 3; ring += 1){
        const phase = (timeSec * 0.6 + ring * 0.33) % 1;
        const radius = Math.max(4, maxR * (0.25 + phase * 0.75) * (0.75 + energy.bass * 0.45));
        ctx.strokeStyle = palette.accent;
        ctx.globalAlpha = Math.max(0.15, (1 - phase) * (0.4 + energy.rms * 0.6));
        ctx.lineWidth = 1.5 + energy.mid * 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}
class WebGlShaderRenderer {
    gl = null;
    program = null;
    buffer = null;
    uniforms = null;
    init(canvas) {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return false;
        const compile = (type, src)=>{
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };
        const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
        const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
        if (!vs || !fs) {
            if (vs) gl.deleteShader(vs);
            if (fs) gl.deleteShader(fs);
            return false;
        }
        const program = gl.createProgram();
        if (!program) {
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return false;
        }
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);
            return false;
        }
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1,
            -1,
            1,
            -1,
            -1,
            1,
            1,
            1
        ]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(program, 'a_pos');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        this.gl = gl;
        this.program = program;
        this.buffer = buffer;
        this.uniforms = {
            res: gl.getUniformLocation(program, 'u_res'),
            time: gl.getUniformLocation(program, 'u_time'),
            bass: gl.getUniformLocation(program, 'u_bass'),
            mid: gl.getUniformLocation(program, 'u_mid'),
            treble: gl.getUniformLocation(program, 'u_treble'),
            accent: gl.getUniformLocation(program, 'u_accent')
        };
        return true;
    }
    render(width, height, timeSec, energy, accentHex) {
        if (!this.gl || !this.program || !this.uniforms) return false;
        const gl = this.gl;
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.program);
        const [r, g, b] = parseHexColorRgb(accentHex);
        gl.uniform2f(this.uniforms.res, width, height);
        gl.uniform1f(this.uniforms.time, timeSec);
        gl.uniform1f(this.uniforms.bass, energy.bass);
        gl.uniform1f(this.uniforms.mid, energy.mid);
        gl.uniform1f(this.uniforms.treble, energy.treble);
        gl.uniform3f(this.uniforms.accent, r, g, b);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
    }
    dispose() {
        if (this.gl) {
            if (this.buffer) this.gl.deleteBuffer(this.buffer);
            if (this.program) this.gl.deleteProgram(this.program);
        }
        this.gl = null;
        this.program = null;
        this.buffer = null;
        this.uniforms = null;
    }
}
class VisualizerEngine {
    mode;
    palette;
    requestFrame;
    cancelFrame;
    canvas = null;
    ctx2d = null;
    webgl = null;
    analyser = null;
    freqBuf = new Uint8Array(0);
    timeBuf = new Uint8Array(0);
    spectrum;
    bandScratch;
    waveScratch = new Float32Array(128);
    width = 320;
    height = 96;
    rafId = null;
    mounted = false;
    startMs = 0;
    constructor(options = {}){
        this.mode = options.mode ?? 'spectrum';
        this.palette = {
            ...DEFAULT_VIS_PALETTE,
            ...options.palette
        };
        this.spectrum = createSpectrumState(options.barCount ?? 24);
        this.bandScratch = new Float32Array(this.spectrum.barCount);
        this.requestFrame = options.requestFrame ?? ((cb)=>typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : Number(setTimeout(()=>cb(Date.now()), 16)));
        this.cancelFrame = options.cancelFrame ?? ((id)=>{
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
            else clearTimeout(id);
        });
    }
    getMode() {
        return this.mode;
    }
    isRunning() {
        return this.mounted && this.rafId !== null;
    }
    getDimensions() {
        return {
            width: this.width,
            height: this.height
        };
    }
    setPalette(patch) {
        this.palette = {
            ...this.palette,
            ...patch
        };
    }
    setAnalyser(analyser) {
        this.analyser = analyser;
        const bins = analyser?.frequencyBinCount ?? 0;
        if (bins > 0 && this.freqBuf.length !== bins) {
            this.freqBuf = new Uint8Array(bins);
            this.timeBuf = new Uint8Array(bins * 2);
        }
    }
    setMode(mode) {
        this.mode = mode;
        if (this.mounted && this.canvas) {
            this.initContextsForMode(this.canvas);
        }
    }
    initContextsForMode(canvas) {
        if (this.mode === 'shader') {
            if (!this.webgl) {
                const renderer = new WebGlShaderRenderer();
                if (renderer.init(canvas)) {
                    this.webgl = renderer;
                    return;
                }
            } else {
                return;
            }
        }
        this.ctx2d = canvas.getContext('2d');
    }
    mount(canvas, initialSize) {
        this.unmount();
        this.canvas = canvas;
        this.mounted = true;
        this.startMs = 0;
        const w = initialSize?.width ?? canvas.clientWidth ?? canvas.width ?? 320;
        const h = initialSize?.height ?? canvas.clientHeight ?? canvas.height ?? 96;
        this.resize(w, h, initialSize?.dpr ?? 1);
        this.initContextsForMode(canvas);
        this.scheduleNextFrame();
    }
    resize(cssWidth, cssHeight, dpr = 1) {
        const safeDpr = Number.isFinite(dpr) && dpr > 0 ? Math.min(3, dpr) : 1;
        const w = Math.max(32, Math.round((Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 320) * safeDpr));
        const h = Math.max(24, Math.round((Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 96) * safeDpr));
        this.width = w;
        this.height = h;
        if (this.canvas) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }
    renderFrame(timestampMs) {
        if (!this.mounted) return;
        if (this.startMs === 0) this.startMs = timestampMs;
        const elapsedSec = Math.max(0, (timestampMs - this.startMs) / 1000);
        if (this.analyser && this.freqBuf.length > 0) {
            this.analyser.getByteFrequencyData(this.freqBuf);
            this.analyser.getByteTimeDomainData(this.timeBuf);
        } else {
            this.freqBuf.fill(0);
            this.timeBuf.fill(128);
        }
        if (this.mode === 'shader') {
            const energy = computeAudioEnergy(this.freqBuf);
            if (this.webgl?.render(this.width, this.height, elapsedSec, energy, this.palette.accent)) {
                return;
            }
            if (this.ctx2d) {
                renderFallbackWaves2D(this.ctx2d, this.width, this.height, energy, elapsedSec, this.palette);
            }
            return;
        }
        if (!this.ctx2d) return;
        if (this.mode === 'oscilloscope') {
            downsampleWaveform(this.timeBuf, this.waveScratch.length, this.waveScratch);
            renderOscilloscope2D(this.ctx2d, this.width, this.height, this.waveScratch, this.palette);
            return;
        }
        computeLogFrequencyBands(this.freqBuf, this.spectrum.barCount, this.bandScratch);
        stepSpectrumState(this.spectrum, this.bandScratch);
        renderSpectrum2D(this.ctx2d, this.width, this.height, this.spectrum, this.palette);
    }
    scheduleNextFrame() {
        if (!this.mounted) return;
        this.rafId = this.requestFrame((ts)=>{
            if (!this.mounted) return;
            this.rafId = null;
            this.renderFrame(ts);
            this.scheduleNextFrame();
        });
    }
    unmount() {
        this.mounted = false;
        if (this.rafId !== null) {
            this.cancelFrame(this.rafId);
            this.rafId = null;
        }
        this.webgl?.dispose();
        this.webgl = null;
        this.ctx2d = null;
        this.canvas = null;
    }
}

export const manifest = {
    id: 'mplay3r.visualizers',
    name: 'Audio Visualizers Pack',
    version: '1.0.0',
    description: 'Lightweight audio-reactive visualizers powered by getAudioAnalyser(): Winamp spectrum analyzer with peak-hold, zero-crossing oscilloscope, WebGL GLSL shader, and fullscreen mode.',
    category: 'visualizer',
    permissions: [
        'audio-analyser',
        'ui-slot',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
const VIS_STORAGE_MODE_KEY = 'visualizerMode';
let activeEngine = null;
function readCssAccent(host) {
    if (typeof getComputedStyle !== 'function') return '#22d3ee';
    const raw = getComputedStyle(host).getPropertyValue('--ds-color-primary-base').trim();
    return /^#[0-9a-f]{3,6}$/i.test(raw) ? raw : '#22d3ee';
}
function visBtn(label, active, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = active ? 'padding:0.14rem 0.48rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.68rem;font-weight:700;cursor:pointer' : 'padding:0.14rem 0.48rem;border-radius:999px;border:1px solid var(--mp-border);background:rgba(0,0,0,0.35);color:var(--mp-text);font-size:0.68rem;cursor:pointer';
    btn.addEventListener('click', onClick);
    return btn;
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const savedMode = await ctx.storage.get(VIS_STORAGE_MODE_KEY);
        const initialMode = savedMode === 'spectrum' || savedMode === 'oscilloscope' || savedMode === 'shader' ? savedMode : 'spectrum';
        const engine = new VisualizerEngine({
            mode: initialMode,
            barCount: 28
        });
        activeEngine = engine;
        const refreshAnalyser = async ()=>{
            try {
                const analyser = await ctx.getAudioAnalyser();
                engine.setAnalyser(analyser);
            } catch  {}
        };
        await refreshAnalyser();
        ctx.on('stateChange', ()=>{
            void refreshAnalyser();
        });
        ctx.on('paletteChange', ()=>{
            if (typeof document !== 'undefined') {
                const host = document.querySelector(ctx.playerTarget);
                if (host) engine.setPalette({
                    accent: readCssAccent(host)
                });
            }
        });
        ctx.registerSlot({
            id: 'visualizer-stage',
            slot: 'visualizer',
            title: 'Visualizer',
            mount (container) {
                container.innerHTML = '';
                const stage = document.createElement('div');
                stage.style.cssText = 'position:relative;width:100%;height:110px;border-radius:8px;overflow:hidden;border:1px solid var(--mp-border);background:#0c0f15';
                let canvas = document.createElement('canvas');
                canvas.style.cssText = 'display:block;width:100%;height:100%';
                const toolbar = document.createElement('div');
                toolbar.style.cssText = 'position:absolute;top:0.35rem;right:0.35rem;display:flex;gap:0.25rem;z-index:2';
                const syncCanvasSize = ()=>{
                    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                    engine.resize(stage.clientWidth || 320, stage.clientHeight || 110, dpr);
                };
                const switchMode = (nextMode)=>{
                    const prevWasShader = engine.getMode() === 'shader';
                    const nextIsShader = nextMode === 'shader';
                    if (prevWasShader !== nextIsShader) {
                        engine.unmount();
                        const fresh = document.createElement('canvas');
                        fresh.style.cssText = 'display:block;width:100%;height:100%';
                        canvas.replaceWith(fresh);
                        canvas = fresh;
                        engine.setMode(nextMode);
                        engine.mount(canvas, {
                            width: stage.clientWidth || 320,
                            height: stage.clientHeight || 110,
                            dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
                        });
                    } else {
                        engine.setMode(nextMode);
                    }
                    void ctx.storage.set(VIS_STORAGE_MODE_KEY, nextMode);
                    renderToolbar();
                };
                const renderToolbar = ()=>{
                    toolbar.innerHTML = '';
                    const mode = engine.getMode();
                    toolbar.append(visBtn('Spectrum', mode === 'spectrum', ()=>switchMode('spectrum')), visBtn('Scope', mode === 'oscilloscope', ()=>switchMode('oscilloscope')), visBtn('WebGL', mode === 'shader', ()=>switchMode('shader')), visBtn('⛶', false, ()=>{
                        if (typeof document !== 'undefined' && document.fullscreenElement) {
                            void document.exitFullscreen?.();
                        } else {
                            void stage.requestFullscreen?.();
                        }
                    }));
                };
                stage.append(canvas, toolbar);
                container.append(stage);
                renderToolbar();
                engine.setPalette({
                    accent: readCssAccent(stage)
                });
                engine.mount(canvas, {
                    width: stage.clientWidth || 320,
                    height: stage.clientHeight || 110,
                    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
                });
                let ro = null;
                if (typeof ResizeObserver !== 'undefined') {
                    ro = new ResizeObserver(()=>syncCanvasSize());
                    ro.observe(stage);
                }
                return ()=>{
                    ro?.disconnect();
                    ro = null;
                    engine.unmount();
                    container.innerHTML = '';
                };
            }
        });
    },
    deactivate () {
        activeEngine?.unmount();
        activeEngine = null;
    }
};
export default plugin;
