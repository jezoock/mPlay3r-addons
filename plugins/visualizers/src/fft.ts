/**
 * Pure FFT band mapping, Winamp-style peak-hold / decay physics, energy extraction,
 * and zero-crossing-aligned oscilloscope resampling (zero dependencies).
 */

export interface SpectrumState {
  barCount: number;
  bars: Float32Array;
  peaks: Float32Array;
  peakHoldFrames: Uint16Array;
}

export interface SpectrumStepOptions {
  /** Rising blend factor in `(0, 1]` (higher = snappier rise). Default `0.65`. */
  riseSmoothing?: number;
  /** Bar downward decay per frame (normalized `[0, 1]`). Default `0.045`. */
  barDecay?: number;
  /** Number of frames a peak cap holds before falling. Default `14`. */
  peakHold?: number;
  /** Peak cap downward decay per frame after hold expires. Default `0.018`. */
  peakDecay?: number;
}

export interface AudioEnergyMetrics {
  bass: number;
  mid: number;
  treble: number;
  rms: number;
}

/** Allocates a fresh zeroed spectrum analyzer state for `barCount` frequency bands. */
export function createSpectrumState(barCount = 24): SpectrumState {
  const count = Math.max(4, Math.min(128, Math.floor(barCount)));
  return {
    barCount: count,
    bars: new Float32Array(count),
    peaks: new Float32Array(count),
    peakHoldFrames: new Uint16Array(count),
  };
}

/**
 * Maps linear FFT magnitude bytes (`0..255`) onto logarithmically spaced musical frequency bars
 * normalized into `[0, 1]`.
 */
export function computeLogFrequencyBands(
  fftBytes: Uint8Array,
  barCount: number,
  out: Float32Array = new Float32Array(barCount),
): Float32Array {
  const count = Math.max(1, barCount);
  if (fftBytes.length === 0) {
    out.fill(0);
    return out;
  }

  const usableBins = Math.max(1, Math.floor(fftBytes.length * 0.85));
  const minBin = 1;
  const maxBin = Math.max(minBin + 1, usableBins);
  const ratio = maxBin / minBin;

  for (let i = 0; i < count; i += 1) {
    const startF = minBin * Math.pow(ratio, i / count);
    const endF = minBin * Math.pow(ratio, (i + 1) / count);
    const startIdx = Math.min(fftBytes.length - 1, Math.max(0, Math.floor(startF) - 1));
    const endIdx = Math.min(fftBytes.length, Math.max(startIdx + 1, Math.ceil(endF)));

    let sum = 0;
    let peak = 0;
    for (let b = startIdx; b < endIdx; b += 1) {
      const val = fftBytes[b] / 255;
      sum += val;
      if (val > peak) peak = val;
    }
    const avg = sum / (endIdx - startIdx);
    // Blend peak & average for crisp Winamp-style transient response
    out[i] = Math.min(1, Math.max(0, avg * 0.55 + peak * 0.45));
  }
  return out;
}

/**
 * Advances bar levels and Winamp-style floating peak-hold caps by one animation frame.
 * Mutates `state` in place (zero per-frame allocations) and returns it.
 */
export function stepSpectrumState(
  state: SpectrumState,
  targetLevels: Float32Array,
  options: SpectrumStepOptions = {},
): SpectrumState {
  const rise = Math.min(1, Math.max(0.05, options.riseSmoothing ?? 0.65));
  const barDecay = Math.max(0.001, options.barDecay ?? 0.045);
  const peakHold = Math.max(0, Math.floor(options.peakHold ?? 14));
  const peakDecay = Math.max(0.001, options.peakDecay ?? 0.018);

  const len = Math.min(state.barCount, targetLevels.length);
  for (let i = 0; i < len; i += 1) {
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

/** Extracts normalized bass/mid/treble/RMS energies `[0, 1]` for WebGL shader uniforms. */
export function computeAudioEnergy(fftBytes: Uint8Array): AudioEnergyMetrics {
  const n = fftBytes.length;
  if (n === 0) {
    return { bass: 0, mid: 0, treble: 0, rms: 0 };
  }
  const bassEnd = Math.max(1, Math.floor(n * 0.1));
  const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.4));
  const trebleEnd = Math.max(midEnd + 1, Math.floor(n * 0.85));

  const avgSlice = (from: number, to: number): number => {
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += fftBytes[i] / 255;
    return sum / Math.max(1, to - from);
  };

  let sqSum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = fftBytes[i] / 255;
    sqSum += v * v;
  }

  return {
    bass: avgSlice(0, bassEnd),
    mid: avgSlice(bassEnd, midEnd),
    treble: avgSlice(midEnd, trebleEnd),
    rms: Math.sqrt(sqSum / n),
  };
}

/**
 * Converts unsigned 8-bit time-domain PCM bytes (`0..255`) into signed `[-1, 1]` samples
 * aligned on the first upward zero-crossing to eliminate horizontal oscilloscope jitter.
 */
export function downsampleWaveform(
  timeDomainBytes: Uint8Array,
  sampleCount: number,
  out: Float32Array = new Float32Array(sampleCount),
): Float32Array {
  const count = Math.max(2, sampleCount);
  const n = timeDomainBytes.length;
  if (n === 0) {
    out.fill(0);
    return out;
  }

  // Locate rising zero-crossing in the first half of the buffer for trigger stabilization.
  let start = 0;
  const searchLimit = Math.floor(n / 2);
  for (let i = 1; i < searchLimit; i += 1) {
    if (timeDomainBytes[i - 1] < 128 && timeDomainBytes[i] >= 128) {
      start = i;
      break;
    }
  }

  const windowLen = Math.max(1, n - start);
  for (let i = 0; i < count; i += 1) {
    const idx = Math.min(n - 1, start + Math.floor((i / (count - 1)) * (windowLen - 1)));
    out[i] = (timeDomainBytes[idx] - 128) / 128;
  }
  return out;
}
