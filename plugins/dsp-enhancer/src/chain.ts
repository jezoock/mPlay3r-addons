import type { PluginStorage } from '../../../sdk/types';
import { clampDspParams, DEFAULT_DSP_PARAMS, DSP_WORKLET_NAME, DSP_WORKLET_SOURCE } from './worklet';
import type { DspEnhancerParams } from './worklet';

export type DspRuntimeMode = 'detached' | 'worklet' | 'biquad-fallback';

export interface AudioParamLike {
  value: number;
  setValueAtTime?(value: number, startTime: number): void;
}

export interface AudioWorkletNodeLike {
  parameters: Map<string, AudioParamLike>;
  connect(dest: unknown): unknown;
  disconnect(): void;
}

export interface BiquadFilterNodeLike {
  type: BiquadFilterType;
  frequency: AudioParamLike;
  gain: AudioParamLike;
  connect(dest: unknown): unknown;
  disconnect(): void;
}

export interface DspAudioContextLike {
  readonly currentTime: number;
  readonly destination?: unknown;
  readonly audioWorklet?: {
    addModule(moduleUrl: string): Promise<void>;
  };
  createBiquadFilter(): BiquadFilterNodeLike;
}

export type WorkletNodeFactory = (ctx: DspAudioContextLike, name: string) => AudioWorkletNodeLike;

const DSP_STORAGE_KEY = 'dspEnhancerParams';

/**
 * Manages attaching the DSP Enhancer onto `getAudioContext()` (preferring `AudioWorkletNode`,
 * falling back cleanly to a native `BiquadFilterNode` lowshelf), lossless bypass without
 * losing saved sliders, persistence in `ctx.storage`, and leak-free `detach()`.
 */
export class DspEnhancerController {
  private readonly storage: PluginStorage;
  private readonly createWorkletNode: WorkletNodeFactory;
  private params: DspEnhancerParams = { ...DEFAULT_DSP_PARAMS };
  private mode: DspRuntimeMode = 'detached';
  private audioCtx: DspAudioContextLike | null = null;
  private workletNode: AudioWorkletNodeLike | null = null;
  private fallbackFilter: BiquadFilterNodeLike | null = null;

  constructor(storage: PluginStorage, options: { createWorkletNode?: WorkletNodeFactory } = {}) {
    this.storage = storage;
    this.createWorkletNode =
      options.createWorkletNode ??
      ((ctx, name) => {
        if (typeof AudioWorkletNode === 'undefined') {
          throw new Error('AudioWorkletNode constructor unavailable');
        }
        return new AudioWorkletNode(ctx as unknown as BaseAudioContext, name) as unknown as AudioWorkletNodeLike;
      });
  }

  async load(): Promise<DspEnhancerParams> {
    const saved = await this.storage.get<Partial<DspEnhancerParams>>(DSP_STORAGE_KEY);
    if (saved && typeof saved === 'object') {
      this.params = clampDspParams(saved);
    }
    return this.getParams();
  }

  getParams(): DspEnhancerParams {
    return { ...this.params };
  }

  getMode(): DspRuntimeMode {
    return this.mode;
  }

  getActiveNode(): AudioWorkletNodeLike | BiquadFilterNodeLike | null {
    return this.workletNode ?? this.fallbackFilter;
  }

  /** Attaches the DSP node to the provided `AudioContext` (idempotent for the same context). */
  async attach(audioCtx: DspAudioContextLike): Promise<DspRuntimeMode> {
    if (this.audioCtx === audioCtx && this.mode !== 'detached') {
      this.syncNodeParameters();
      return this.mode;
    }

    this.detach();
    this.audioCtx = audioCtx;

    if (audioCtx.audioWorklet && typeof audioCtx.audioWorklet.addModule === 'function') {
      let blobUrl: string | null = null;
      try {
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          blobUrl = URL.createObjectURL(new Blob([DSP_WORKLET_SOURCE], { type: 'application/javascript' }));
          await audioCtx.audioWorklet.addModule(blobUrl);
        } else {
          await audioCtx.audioWorklet.addModule(`data:application/javascript,${encodeURIComponent(DSP_WORKLET_SOURCE)}`);
        }
        this.workletNode = this.createWorkletNode(audioCtx, DSP_WORKLET_NAME);
        this.mode = 'worklet';
        this.syncNodeParameters();
        return this.mode;
      } catch {
        // Fall through cleanly to native BiquadFilterNode fallback.
        this.workletNode = null;
      } finally {
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

  async updateParams(patch: Partial<DspEnhancerParams>): Promise<DspEnhancerParams> {
    this.params = clampDspParams({ ...this.params, ...patch });
    this.syncNodeParameters();
    await this.storage.set(DSP_STORAGE_KEY, this.params);
    return this.getParams();
  }

  /** Toggles bypass cleanly without altering saved `bassBoost` or `stereoWidth` parameters. */
  async setEnabled(enabled: boolean): Promise<DspEnhancerParams> {
    return this.updateParams({ enabled });
  }

  async toggleBypass(): Promise<DspEnhancerParams> {
    return this.setEnabled(!this.params.enabled);
  }

  async reset(): Promise<DspEnhancerParams> {
    return this.updateParams({ ...DEFAULT_DSP_PARAMS });
  }

  private syncNodeParameters(): void {
    const now = this.audioCtx?.currentTime ?? 0;

    if (this.workletNode) {
      const setParam = (name: string, val: number) => {
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
      // Lossless bypass in fallback mode sets lowshelf gain to exactly 0 dB while preserving saved sliders.
      const dbGain = this.params.enabled ? this.params.bassBoost * 9 : 0;
      if (typeof this.fallbackFilter.gain.setValueAtTime === 'function') {
        this.fallbackFilter.gain.setValueAtTime(dbGain, now);
      } else {
        this.fallbackFilter.gain.value = dbGain;
      }
    }
  }

  /** Disconnects active DSP nodes and resets runtime state cleanly. */
  detach(): void {
    try {
      this.workletNode?.disconnect();
    } catch {
      // Ignore disconnect errors on already-closed context.
    }
    try {
      this.fallbackFilter?.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
    this.workletNode = null;
    this.fallbackFilter = null;
    this.audioCtx = null;
    this.mode = 'detached';
  }
}
