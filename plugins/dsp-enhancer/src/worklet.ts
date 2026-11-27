/**
 * Zero-dependency AudioWorklet DSP processor (Harmonic Bass Enhancer + Mid/Side Stereo Widener)
 * with exact TypeScript reference DSP kernel for deterministic unit testing and bit-exact bypass.
 */

export const DSP_WORKLET_NAME = 'mplay3r-dsp-enhancer';

export interface DspEnhancerParams {
  enabled: boolean;
  /** Harmonic bass enhancer intensity in `[0, 1]`. */
  bassBoost: number;
  /** Mid/Side stereo width in `[0, 2]` (`0` = mono, `1` = neutral, `2` = wide). */
  stereoWidth: number;
}

export interface DspFilterMemory {
  lpL: number;
  lpR: number;
}

export const DEFAULT_DSP_PARAMS: Readonly<DspEnhancerParams> = {
  enabled: true,
  bassBoost: 0.35,
  stereoWidth: 1.25,
};

/** Clamps user-supplied DSP settings into safe, artifact-free parameter bounds. */
export function clampDspParams(raw: Partial<DspEnhancerParams>): DspEnhancerParams {
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_DSP_PARAMS.enabled;
  const bassBoost =
    typeof raw.bassBoost === 'number' && Number.isFinite(raw.bassBoost)
      ? Math.min(1, Math.max(0, Math.round(raw.bassBoost * 100) / 100))
      : DEFAULT_DSP_PARAMS.bassBoost;
  const stereoWidth =
    typeof raw.stereoWidth === 'number' && Number.isFinite(raw.stereoWidth)
      ? Math.min(2, Math.max(0, Math.round(raw.stereoWidth * 100) / 100))
      : DEFAULT_DSP_PARAMS.stereoWidth;
  return { enabled, bassBoost, stereoWidth };
}

/** Smooth algebraic soft-clipper preventing harsh digital clipping past `[-1, 1]`. */
export function softClipSample(x: number): number {
  return x / (1 + Math.abs(x) * 0.35);
}

/**
 * Processes a stereo PCM block `(inL, inR) -> (outL, outR)` with:
 * - Instant bit-identical bypass when `params.enabled === false`.
 * - 1st-order low-pass (~120 Hz) + harmonic exciter Bass Enhancer.
 * - Mid/Side matrix Stereo Widener (`M = 0.5*(L+R)`, `S = 0.5*(L-R)`).
 */
export function processDspStereoBlock(
  inL: Float32Array,
  inR: Float32Array,
  outL: Float32Array,
  outR: Float32Array,
  params: DspEnhancerParams,
  sampleRate = 48000,
  memory: DspFilterMemory = { lpL: 0, lpR: 0 },
): DspFilterMemory {
  const len = Math.min(inL.length, inR.length, outL.length, outR.length);

  if (!params.enabled) {
    for (let i = 0; i < len; i += 1) {
      outL[i] = inL[i];
      outR[i] = inR[i];
    }
    return memory;
  }

  const cutoffHz = 120;
  const alpha = Math.min(0.5, (2 * Math.PI * cutoffHz) / Math.max(8000, sampleRate));
  const bassAmt = Math.min(1, Math.max(0, params.bassBoost));
  const width = Math.min(2, Math.max(0, params.stereoWidth));

  let lpL = memory.lpL;
  let lpR = memory.lpR;

  for (let i = 0; i < len; i += 1) {
    const l = inL[i];
    const r = inR[i];

    // 1st-order low-pass bass extraction + subtle harmonic warmth
    lpL += alpha * (l - lpL);
    lpR += alpha * (r - lpR);
    const excL = bassAmt > 0 ? Math.tanh(lpL * (1.8 + bassAmt * 1.4)) * bassAmt * 0.55 : 0;
    const excR = bassAmt > 0 ? Math.tanh(lpR * (1.8 + bassAmt * 1.4)) * bassAmt * 0.55 : 0;

    const bL = l + excL;
    const bR = r + excR;

    // Mid/Side Stereo Widening
    const mid = 0.5 * (bL + bR);
    const side = 0.5 * (bL - bR) * width;

    outL[i] = Math.max(-1, Math.min(1, softClipSample(mid + side)));
    outR[i] = Math.max(-1, Math.min(1, softClipSample(mid - side)));
  }

  memory.lpL = lpL;
  memory.lpR = lpR;
  return memory;
}

/**
 * Self-contained AudioWorkletProcessor JavaScript source registered via Blob URL on `audioContext.audioWorklet`.
 */
export const DSP_WORKLET_SOURCE = `
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
