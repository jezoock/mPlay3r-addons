import {
  computeAudioEnergy,
  computeLogFrequencyBands,
  createSpectrumState,
  downsampleWaveform,
  stepSpectrumState,
} from './fft';
import type { AudioEnergyMetrics, SpectrumState } from './fft';

export type VisualizerMode = 'spectrum' | 'oscilloscope' | 'shader';

export interface AnalyserLike {
  readonly frequencyBinCount: number;
  getByteFrequencyData(array: Uint8Array): void;
  getByteTimeDomainData(array: Uint8Array): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  clientWidth?: number;
  clientHeight?: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
  getContext(contextId: 'webgl' | 'experimental-webgl'): WebGLRenderingContext | null;
  requestFullscreen?(): Promise<void>;
}

export interface VisualizerPalette {
  bg: string;
  accent: string;
  peak: string;
  grid: string;
}

export interface VisualizerEngineOptions {
  mode?: VisualizerMode;
  barCount?: number;
  palette?: Partial<VisualizerPalette>;
  requestFrame?: (cb: (timeMs: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

const DEFAULT_VIS_PALETTE: VisualizerPalette = {
  bg: '#0c0f15',
  accent: '#22d3ee',
  peak: '#f8fafc',
  grid: 'rgba(255,255,255,0.08)',
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

/** Parses a `#RGB` or `#RRGGBB` CSS hex color into normalized `[r, g, b]` floats. */
export function parseHexColorRgb(hex: string): [number, number, number] {
  const clean = (hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return [
      Number.parseInt(clean.slice(0, 2), 16) / 255,
      Number.parseInt(clean.slice(2, 4), 16) / 255,
      Number.parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return [
      Number.parseInt(clean[0] + clean[0], 16) / 255,
      Number.parseInt(clean[1] + clean[1], 16) / 255,
      Number.parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  return [0.13, 0.83, 0.93];
}

/** Renders a crisp Winamp-inspired segmented LED spectrum analyzer with floating peak-hold caps. */
export function renderSpectrum2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SpectrumState,
  palette: VisualizerPalette,
): void {
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

  for (let i = 0; i < state.barCount; i += 1) {
    const x = pad + i * (barW + gap);
    const activeSegs = Math.round(state.bars[i] * segments);

    for (let s = 0; s < activeSegs; s += 1) {
      const ratio = s / Math.max(1, segments - 1);
      if (ratio > 0.82) ctx.fillStyle = '#ef4444';
      else if (ratio > 0.58) ctx.fillStyle = '#f59e0b';
      else ctx.fillStyle = palette.accent;
      const y = pad + innerH - (s + 1) * segH - s * segGap;
      ctx.fillRect(x, y, barW, segH);
    }

    // Floating Winamp peak cap
    const peakVal = state.peaks[i];
    if (peakVal > 0.01) {
      const peakY = pad + innerH - peakVal * innerH;
      ctx.fillStyle = palette.peak;
      ctx.fillRect(x, Math.max(pad, peakY - 2), barW, 2);
    }
  }
}

/** Renders a minimalist zero-crossing-aligned oscilloscope trace on Canvas 2D. */
export function renderOscilloscope2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  waveform: Float32Array,
  palette: VisualizerPalette,
): void {
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
  for (let i = 0; i < waveform.length; i += 1) {
    const x = (i / (waveform.length - 1)) * width;
    const y = midY - waveform[i] * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Canvas 2D radial fallback when WebGL is unavailable in the host browser/WebView. */
export function renderFallbackWaves2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  energy: AudioEnergyMetrics,
  timeSec: number,
  palette: VisualizerPalette,
): void {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.44;
  for (let ring = 0; ring < 3; ring += 1) {
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

/** Minimal WebGL 1.0 audio-reactive GLSL full-quad shader renderer with deterministic GPU resource cleanup. */
export class WebGlShaderRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    bass: WebGLUniformLocation | null;
    mid: WebGLUniformLocation | null;
    treble: WebGLUniformLocation | null;
    accent: WebGLUniformLocation | null;
  } | null = null;

  init(canvas: CanvasLike): boolean {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return false;

    const compile = (type: number, src: string): WebGLShader | null => {
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

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
      accent: gl.getUniformLocation(program, 'u_accent'),
    };
    return true;
  }

  render(width: number, height: number, timeSec: number, energy: AudioEnergyMetrics, accentHex: string): boolean {
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

  dispose(): void {
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

/**
 * Leak-free visualizer lifecycle engine managing `mount`, `resize`, `setMode`,
 * `AnalyserNode` binding, and deterministic `requestAnimationFrame` cancellation on `unmount`.
 */
export class VisualizerEngine {
  private mode: VisualizerMode;
  private palette: VisualizerPalette;
  private readonly requestFrame: (cb: (timeMs: number) => void) => number;
  private readonly cancelFrame: (id: number) => void;

  private canvas: CanvasLike | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private webgl: WebGlShaderRenderer | null = null;
  private analyser: AnalyserLike | null = null;
  private freqBuf = new Uint8Array(0);
  private timeBuf = new Uint8Array(0);
  private readonly spectrum: SpectrumState;
  private readonly bandScratch: Float32Array;
  private readonly waveScratch = new Float32Array(128);

  private width = 320;
  private height = 96;
  private rafId: number | null = null;
  private mounted = false;
  private startMs = 0;

  constructor(options: VisualizerEngineOptions = {}) {
    this.mode = options.mode ?? 'spectrum';
    this.palette = { ...DEFAULT_VIS_PALETTE, ...options.palette };
    this.spectrum = createSpectrumState(options.barCount ?? 24);
    this.bandScratch = new Float32Array(this.spectrum.barCount);
    this.requestFrame =
      options.requestFrame ??
      (cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : Number(setTimeout(() => cb(Date.now()), 16))));
    this.cancelFrame =
      options.cancelFrame ??
      (id => {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        else clearTimeout(id);
      });
  }

  getMode(): VisualizerMode {
    return this.mode;
  }

  isRunning(): boolean {
    return this.mounted && this.rafId !== null;
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  setPalette(patch: Partial<VisualizerPalette>): void {
    this.palette = { ...this.palette, ...patch };
  }

  setAnalyser(analyser: AnalyserLike | null): void {
    this.analyser = analyser;
    const bins = analyser?.frequencyBinCount ?? 0;
    if (bins > 0 && this.freqBuf.length !== bins) {
      this.freqBuf = new Uint8Array(bins);
      this.timeBuf = new Uint8Array(bins * 2);
    }
  }

  setMode(mode: VisualizerMode): void {
    this.mode = mode;
    if (this.mounted && this.canvas) {
      this.initContextsForMode(this.canvas);
    }
  }

  private initContextsForMode(canvas: CanvasLike): void {
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

  /** Mounts the engine on a canvas and starts the `requestAnimationFrame` loop. */
  mount(canvas: CanvasLike, initialSize?: { width: number; height: number; dpr?: number }): void {
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

  /** Resizes the backing canvas buffer safely (clamped to positive integer dimensions). */
  resize(cssWidth: number, cssHeight: number, dpr = 1): void {
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

  /** Renders a single frame synchronously (also usable directly by tests). */
  renderFrame(timestampMs: number): void {
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

  private scheduleNextFrame(): void {
    if (!this.mounted) return;
    this.rafId = this.requestFrame(ts => {
      if (!this.mounted) return;
      this.rafId = null;
      this.renderFrame(ts);
      this.scheduleNextFrame();
    });
  }

  /** Stops the RAF loop, cancels any pending animation handle, and disposes WebGL resources. */
  unmount(): void {
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
