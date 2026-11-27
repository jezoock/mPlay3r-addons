import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DspEnhancerController } from '../plugins/dsp-enhancer/src/chain';
import type { AudioParamLike, AudioWorkletNodeLike, BiquadFilterNodeLike, DspAudioContextLike } from '../plugins/dsp-enhancer/src/chain';
import dspPlugin from '../plugins/dsp-enhancer/src/index';
import {
  clampDspParams,
  DSP_WORKLET_NAME,
  DSP_WORKLET_SOURCE,
  processDspStereoBlock,
} from '../plugins/dsp-enhancer/src/worklet';
import {
  computeAudioEnergy,
  computeLogFrequencyBands,
  createSpectrumState,
  downsampleWaveform,
  stepSpectrumState,
} from '../plugins/visualizers/src/fft';
import visualizersPlugin from '../plugins/visualizers/src/index';
import { parseHexColorRgb, VisualizerEngine } from '../plugins/visualizers/src/renderers';
import type { AnalyserLike, CanvasLike } from '../plugins/visualizers/src/renderers';
import type { PluginContext, PluginSlotDescriptor, PluginStorage } from '../sdk/types';

function createMemoryStorage(): PluginStorage {
  const map = new Map<string, string>();
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = map.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T): Promise<void> {
      map.set(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
    async clear(): Promise<void> {
      map.clear();
    },
  };
}

describe('PR #13 — Plugins mplay3r.visualizers & mplay3r.dsp-enhancer', () => {
  describe('FFT log-band mapping, Winamp peak-hold/decay & oscilloscope trigger', () => {
    it('maps FFT bins logarithmically, holds peak caps before decaying, extracts energies, and locks oscilloscope zero-crossing', () => {
      const silent = new Uint8Array(64);
      const bandsSilent = computeLogFrequencyBands(silent, 16);
      assert.ok(bandsSilent.every(v => v === 0));

      const bassOnly = new Uint8Array(64);
      bassOnly[0] = 255;
      bassOnly[1] = 255;
      bassOnly[2] = 220;
      const bandsBass = computeLogFrequencyBands(bassOnly, 12);
      assert.ok(bandsBass[0] > 0.8);
      assert.equal(bandsBass[11], 0);

      const energy = computeAudioEnergy(bassOnly);
      assert.ok(energy.bass > 0.4);
      assert.equal(energy.treble, 0);
      assert.ok(energy.rms > 0);

      // Winamp peak-hold & decay physics
      const spec = createSpectrumState(4);
      const hit = new Float32Array([1, 0.5, 0, 0]);
      stepSpectrumState(spec, hit, { riseSmoothing: 1, peakHold: 3, peakDecay: 0.1, barDecay: 0.25 });
      assert.equal(spec.bars[0], 1);
      assert.equal(spec.peaks[0], 1);

      // Signal drops to 0: bar decays immediately, peak stays locked at 1.0 for 3 hold frames
      const zero = new Float32Array([0, 0, 0, 0]);
      for (let frame = 0; frame < 3; frame += 1) {
        stepSpectrumState(spec, zero, { riseSmoothing: 1, peakHold: 3, peakDecay: 0.1, barDecay: 0.25 });
        assert.equal(spec.peaks[0], 1, `Peak should hold on frame ${frame + 1}`);
      }
      assert.ok(spec.bars[0] < 0.3);

      // Frame 4: hold expired -> peak begins decaying smoothly by peakDecay
      stepSpectrumState(spec, zero, { riseSmoothing: 1, peakHold: 3, peakDecay: 0.1, barDecay: 0.25 });
      assert.ok(Math.abs(spec.peaks[0] - 0.9) < 0.001);

      // Oscilloscope trigger aligns on first rising zero-crossing (128)
      const pcm = new Uint8Array(64);
      for (let i = 0; i < 64; i += 1) {
        pcm[i] = i < 10 ? 90 : i === 10 ? 128 : 200;
      }
      const wave = downsampleWaveform(pcm, 16);
      assert.equal(wave[0], 0);
      assert.ok(wave[15] > 0.5);
    });
  });

  describe('VisualizerEngine lifecycle: mount, resize, mode switch & leak-free RAF unmount', () => {
    it('cancels every pending requestAnimationFrame cleanly on unmount and handles DPR resize across modes', () => {
      let nextRafId = 1;
      const pendingRafs = new Map<number, (ts: number) => void>();
      const cancelledIds: number[] = [];
      let drawCalls = 0;

      const fakeCtx2d = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        fillRect: () => {
          drawCalls += 1;
        },
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        arc: () => undefined,
        stroke: () => {
          drawCalls += 1;
        },
      } as unknown as CanvasRenderingContext2D;

      const fakeCanvas: CanvasLike = {
        width: 0,
        height: 0,
        clientWidth: 300,
        clientHeight: 100,
        getContext(id: string) {
          return id === '2d' ? fakeCtx2d : null;
        },
      } as unknown as CanvasLike;

      const fakeAnalyser: AnalyserLike = {
        frequencyBinCount: 32,
        getByteFrequencyData(arr) {
          arr.fill(180);
        },
        getByteTimeDomainData(arr) {
          for (let i = 0; i < arr.length; i += 1) arr[i] = i % 2 === 0 ? 100 : 180;
        },
      };

      const engine = new VisualizerEngine({
        mode: 'spectrum',
        barCount: 12,
        requestFrame(cb) {
          const id = nextRafId;
          nextRafId += 1;
          pendingRafs.set(id, cb);
          return id;
        },
        cancelFrame(id) {
          cancelledIds.push(id);
          pendingRafs.delete(id);
        },
      });
      engine.setAnalyser(fakeAnalyser);
      engine.mount(fakeCanvas, { width: 300, height: 100, dpr: 2 });

      assert.equal(engine.isRunning(), true);
      assert.deepEqual(engine.getDimensions(), { width: 600, height: 200 });
      assert.equal(pendingRafs.size, 1);

      // Step spectrum, oscilloscope, and shader (2D fallback) frames
      const stepOneFrame = (ts: number) => {
        const entry = Array.from(pendingRafs.entries())[0];
        assert.ok(entry);
        pendingRafs.delete(entry[0]);
        entry[1](ts);
      };

      stepOneFrame(100);
      engine.setMode('oscilloscope');
      stepOneFrame(116);
      engine.setMode('shader');
      stepOneFrame(132);
      assert.ok(drawCalls > 10);

      // Resize with DPR clamping
      engine.resize(400, 120, 2);
      assert.deepEqual(engine.getDimensions(), { width: 800, height: 240 });
      assert.equal(fakeCanvas.width, 800);

      // Unmount must cancel the exact pending RAF handle and leave 0 pending callbacks
      const pendingBeforeUnmount = Array.from(pendingRafs.entries())[0];
      assert.ok(pendingBeforeUnmount);
      engine.unmount();
      assert.equal(engine.isRunning(), false);
      assert.equal(pendingRafs.size, 0);
      assert.ok(cancelledIds.includes(pendingBeforeUnmount[0]));

      // Even if a stale RAF callback fires late, it must NOT reschedule anything
      pendingBeforeUnmount[1](148);
      assert.equal(pendingRafs.size, 0);

      // Hex color helper check
      assert.deepEqual(parseHexColorRgb('#ff0080').map(n => Math.round(n * 255)), [255, 0, 128]);
      assert.deepEqual(parseHexColorRgb('#0f0'), [0, 1, 0]);
    });
  });

  describe('DSP Enhancer kernel, AudioWorklet chaining & lossless bypass', () => {
    it('passes audio bit-identically on bypass, widens stereo, collapses to mono at width=0, and enhances bass safely', () => {
      const len = 128;
      const inL = new Float32Array(len);
      const inR = new Float32Array(len);
      for (let i = 0; i < len; i += 1) {
        const bass = Math.sin((2 * Math.PI * 80 * i) / 48000) * 0.4;
        inL[i] = bass + 0.2;
        inR[i] = bass - 0.1;
      }

      // 1. Bypass (enabled=false) -> bit-identical output
      const bypassL = new Float32Array(len);
      const bypassR = new Float32Array(len);
      processDspStereoBlock(inL, inR, bypassL, bypassR, { enabled: false, bassBoost: 1, stereoWidth: 2 });
      assert.deepEqual(bypassL, inL);
      assert.deepEqual(bypassR, inR);

      // 2. Stereo Width = 0 -> exact mono collapse (L === R)
      const monoL = new Float32Array(len);
      const monoR = new Float32Array(len);
      processDspStereoBlock(inL, inR, monoL, monoR, { enabled: true, bassBoost: 0, stereoWidth: 0 });
      for (let i = 0; i < len; i += 1) {
        assert.ok(Math.abs(monoL[i] - monoR[i]) < 1e-6);
      }

      // 3. Stereo Width = 2 + Bass Boost -> widens L-R separation & stays bounded inside [-1, 1]
      const wideL = new Float32Array(len);
      const wideR = new Float32Array(len);
      processDspStereoBlock(inL, inR, wideL, wideR, { enabled: true, bassBoost: 0.8, stereoWidth: 2 });
      assert.ok(Math.abs(wideL[64] - wideR[64]) > Math.abs(inL[64] - inR[64]));
      assert.ok(wideL.every(s => s >= -1 && s <= 1));
      assert.ok(wideR.every(s => s >= -1 && s <= 1));

      // Clamping & inline worklet source verification
      assert.deepEqual(clampDspParams({ bassBoost: 5, stereoWidth: -2, enabled: false }), {
        enabled: false,
        bassBoost: 1,
        stereoWidth: 0,
      });
      assert.ok(DSP_WORKLET_SOURCE.includes(DSP_WORKLET_NAME));
    });

    it('chains AudioWorkletNode with lossless bypass preservation and falls back cleanly to BiquadFilterNode', async () => {
      const storage = createMemoryStorage();
      const paramMap = new Map<string, AudioParamLike>([
        ['bypass', { value: 0 }],
        ['bassBoost', { value: 0.35 }],
        ['stereoWidth', { value: 1.25 }],
      ]);
      let moduleLoadedUrl = '';
      let workletDisconnected = 0;

      const mockWorkletNode: AudioWorkletNodeLike = {
        parameters: paramMap,
        connect: () => mockWorkletNode,
        disconnect() {
          workletDisconnected += 1;
        },
      };

      const workletCtx: DspAudioContextLike = {
        currentTime: 1.5,
        audioWorklet: {
          async addModule(url: string) {
            moduleLoadedUrl = url;
          },
        },
        createBiquadFilter: () => {
          throw new Error('Should not use fallback when AudioWorklet succeeds');
        },
      };

      const ctrl = new DspEnhancerController(storage, {
        createWorkletNode: (_ctx, name) => {
          assert.equal(name, DSP_WORKLET_NAME);
          return mockWorkletNode;
        },
      });
      await ctrl.load();
      await ctrl.updateParams({ bassBoost: 0.7, stereoWidth: 1.6 });

      const mode = await ctrl.attach(workletCtx);
      assert.equal(mode, 'worklet');
      assert.ok(moduleLoadedUrl.length > 0);
      assert.equal(paramMap.get('bypass')?.value, 0);
      assert.equal(paramMap.get('bassBoost')?.value, 0.7);
      assert.equal(paramMap.get('stereoWidth')?.value, 1.6);

      // Toggle bypass ON -> sets bypass=1 WITHOUT losing saved bassBoost/stereoWidth
      await ctrl.toggleBypass();
      assert.equal(ctrl.getParams().enabled, false);
      assert.equal(ctrl.getParams().bassBoost, 0.7);
      assert.equal(ctrl.getParams().stereoWidth, 1.6);
      assert.equal(paramMap.get('bypass')?.value, 1);

      // Toggle bypass OFF -> restores active processing with exact saved parameters
      await ctrl.toggleBypass();
      assert.equal(ctrl.getParams().enabled, true);
      assert.equal(paramMap.get('bypass')?.value, 0);

      ctrl.detach();
      assert.equal(workletDisconnected, 1);
      assert.equal(ctrl.getMode(), 'detached');

      // Fallback path when AudioWorklet is unavailable
      const fallbackFilter: BiquadFilterNodeLike = {
        type: 'peaking',
        frequency: { value: 0 },
        gain: { value: 0 },
        connect: () => fallbackFilter,
        disconnect: () => undefined,
      };
      const noWorkletCtx: DspAudioContextLike = {
        currentTime: 0,
        createBiquadFilter: () => fallbackFilter,
      };
      const fallbackMode = await ctrl.attach(noWorkletCtx);
      assert.equal(fallbackMode, 'biquad-fallback');
      assert.equal(fallbackFilter.type, 'lowshelf');
      assert.ok(fallbackFilter.gain.value > 5);

      await ctrl.setEnabled(false);
      assert.equal(fallbackFilter.gain.value, 0);
      assert.equal(ctrl.getParams().bassBoost, 0.7);
      ctrl.detach();
    });
  });

  describe('Plugin activation & clean teardown for visualizers and dsp-enhancer', () => {
    it('activates both addons cleanly in their respective UI slots and tears down without leaks', async () => {
      const visSlots: PluginSlotDescriptor[] = [];
      const visCtx = {
        manifest: visualizersPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        getAudioAnalyser: async () => null,
        on: () => () => undefined,
        registerSlot: (slot: PluginSlotDescriptor) => {
          visSlots.push(slot);
          return () => undefined;
        },
      } as unknown as PluginContext;

      await visualizersPlugin.activate(visCtx);
      assert.equal(visSlots.length, 1);
      assert.equal(visSlots[0].slot, 'visualizer');
      await visualizersPlugin.deactivate?.();

      const dspSlots: PluginSlotDescriptor[] = [];
      const dspCtx = {
        manifest: dspPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        getAudioContext: async () => null,
        on: () => () => undefined,
        registerSlot: (slot: PluginSlotDescriptor) => {
          dspSlots.push(slot);
          return () => undefined;
        },
      } as unknown as PluginContext;

      await dspPlugin.activate(dspCtx);
      assert.equal(dspSlots.length, 1);
      assert.equal(dspSlots[0].slot, 'panel');
      await dspPlugin.deactivate?.();
    });
  });
});
