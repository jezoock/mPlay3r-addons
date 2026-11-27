import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import themeCyberpunkPlugin from '../plugins/theme-cyberpunk-jukebox/src/index';
import {
  CYBERPUNK_CSS,
  CYBERPUNK_THEME_ID,
  CYBERPUNK_THEME_KEY,
  formatJukeboxCode,
} from '../plugins/theme-cyberpunk-jukebox/src/cyberpunk';
import themeNeumorphPlugin from '../plugins/theme-neumorph/src/index';
import { NEUMORPH_CSS, NEUMORPH_THEME_ID, NEUMORPH_THEME_KEY } from '../plugins/theme-neumorph/src/neumorph';
import themeSeventiesPlugin from '../plugins/theme-seventies/src/index';
import {
  computeVuNeedleAngle,
  SEVENTIES_CSS,
  SEVENTIES_THEME_ID,
  SEVENTIES_THEME_KEY,
} from '../plugins/theme-seventies/src/seventies';
import type {
  PlayerSnapshot,
  PluginContext,
  PluginSlotDescriptor,
  PluginStorage,
  PluginThemeDescriptor,
} from '../sdk/types';

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

class FakeElement {
  tagName: string;
  className = '';
  textContent = '';
  type = '';
  min = '';
  max = '';
  step = '';
  value = '';
  width = 0;
  height = 0;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attrs = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<() => void>>();
  fillRectCalls = 0;

  constructor(tag: string) {
    this.tagName = tag.toLowerCase();
  }

  set innerHTML(val: string) {
    if (val === '') {
      this.children = [];
    }
  }

  get innerHTML(): string {
    return this.children.map(c => `<${c.tagName}>${c.textContent}</${c.tagName}>`).join('');
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  addEventListener(event: string, fn: () => void): void {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }

  click(): void {
    for (const fn of this.listeners.get('click') ?? []) {
      fn();
    }
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const match = (el: FakeElement): boolean => {
      if (selector.startsWith('[')) {
        const attrName = selector.slice(1, -1);
        return el.attrs.has(attrName);
      }
      if (selector.startsWith('.')) {
        return el.className.split(/\s+/).includes(selector.slice(1));
      }
      return el.tagName === selector.toLowerCase();
    };
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        if (match(child)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  getContext(kind: string): Record<string, unknown> | null {
    if (kind !== '2d') return null;
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: () => {
        this.fillRectCalls += 1;
      },
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
    };
  }
}

function withFakeDom<T>(
  opts: { isDesktop?: boolean; onSetActiveTheme?: (key: string | null) => void },
  run: (helpers: {
    container: FakeElement;
    triggerRaf: () => void;
    cancelledRafs: number[];
  }) => Promise<T> | T,
): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const prevDocument = g.document;
  const prevRaf = g.requestAnimationFrame;
  const prevCancelRaf = g.cancelAnimationFrame;
  const prevTauri = g.__TAURI_INTERNALS__;

  let rafSeq = 0;
  const rafQueue = new Map<number, () => void>();
  const cancelledRafs: number[] = [];

  const fakeHostEl = {
    getPluginHost: async () => ({
      setActiveTheme: (key: string | null) => opts.onSetActiveTheme?.(key),
    }),
  };

  g.document = {
    createElement: (tag: string) => new FakeElement(tag),
    querySelector: () => fakeHostEl,
  };
  g.requestAnimationFrame = (cb: () => void) => {
    rafSeq += 1;
    rafQueue.set(rafSeq, cb);
    return rafSeq;
  };
  g.cancelAnimationFrame = (id: number) => {
    cancelledRafs.push(id);
    rafQueue.delete(id);
  };
  if (opts.isDesktop) {
    g.__TAURI_INTERNALS__ = { invoke: async () => undefined };
  } else {
    delete g.__TAURI_INTERNALS__;
  }

  const container = new FakeElement('div');
  const triggerRaf = () => {
    const entries = Array.from(rafQueue.entries());
    rafQueue.clear();
    for (const [, cb] of entries) {
      cb();
    }
  };

  return Promise.resolve()
    .then(() => run({ container, triggerRaf, cancelledRafs }))
    .finally(() => {
      if (prevDocument === undefined) delete g.document;
      else g.document = prevDocument;
      if (prevRaf === undefined) delete g.requestAnimationFrame;
      else g.requestAnimationFrame = prevRaf;
      if (prevCancelRaf === undefined) delete g.cancelAnimationFrame;
      else g.cancelAnimationFrame = prevCancelRaf;
      if (prevTauri === undefined) delete g.__TAURI_INTERNALS__;
      else g.__TAURI_INTERNALS__ = prevTauri;
    });
}

function makeSnapshot(status: PlayerSnapshot['status'] = 'playing'): PlayerSnapshot {
  return {
    status,
    currentTrack: {
      id: 't1',
      src: 'https://example.com/a.mp3',
      title: 'Midnight Drive',
      artist: 'Neon Pulse',
      album: 'Night City',
      duration: 215,
      format: 'MP3',
    },
    currentIndex: 0,
    tracks: [
      {
        id: 't1',
        src: 'https://example.com/a.mp3',
        title: 'Midnight Drive',
        artist: 'Neon Pulse',
        duration: 215,
        format: 'MP3',
      },
      {
        id: 't2',
        src: 'https://example.com/b.flac',
        title: 'Analog Sunset',
        artist: 'Warm Tape',
        duration: 184,
        format: 'FLAC',
      },
    ],
    currentTime: 64,
    duration: 215,
    buffered: 120,
    volume: 0.8,
    muted: false,
    balance: 0,
    shuffle: false,
    repeat: 'off',
    showRemaining: false,
    palette: 'obsidian',
    showEqualizer: false,
    showPlaylist: true,
    compact: false,
  };
}

describe('PR #20 — Neumorphism, Seventies Vintage Hi-Fi & Cyberpunk Neon Jukebox Themes', () => {
  describe('pure theme helpers', () => {
    it('clamps computeVuNeedleAngle cleanly within [-44°..+42°] and handles non-finite inputs', () => {
      assert.equal(computeVuNeedleAngle(0), -44);
      assert.equal(computeVuNeedleAngle(1), 42);
      assert.equal(computeVuNeedleAngle(0.5), -1);
      assert.equal(computeVuNeedleAngle(-5), -44);
      assert.equal(computeVuNeedleAngle(99), 42);
      assert.equal(computeVuNeedleAngle(Number.NaN), -44);
      assert.equal(computeVuNeedleAngle(Number.POSITIVE_INFINITY), -44);
    });

    it('formats classic jukebox bank codes (A1..A9, B1..B9, C1..C9) safely for any index', () => {
      assert.equal(formatJukeboxCode(0), 'A1');
      assert.equal(formatJukeboxCode(8), 'A9');
      assert.equal(formatJukeboxCode(9), 'B1');
      assert.equal(formatJukeboxCode(26), 'C9');
      assert.equal(formatJukeboxCode(-4), 'A1');
      assert.equal(formatJukeboxCode(Number.NaN), 'A1');
    });
  });

  describe('Neumorphism Soft Studio Theme (mplay3r.theme-neumorph)', () => {
    it('registers theme & switcher slot, persists Light/Dark toggle, and renders frameless desktop controls', async () => {
      const storage = createMemoryStorage();
      const themes: PluginThemeDescriptor[] = [];
      const slots: PluginSlotDescriptor[] = [];
      const applied: Array<string | null> = [];
      let listenerCount = 0;

      const ctx = {
        manifest: themeNeumorphPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage,
        playback: {
          seek: async () => undefined,
          setVolume: async () => undefined,
        },
        getState: () => makeSnapshot('playing'),
        on: () => {
          listenerCount += 1;
          return () => {
            listenerCount -= 1;
          };
        },
        registerTheme: (t: PluginThemeDescriptor) => {
          themes.push(t);
          return () => undefined;
        },
        registerSlot: (s: PluginSlotDescriptor) => {
          slots.push(s);
          return () => undefined;
        },
      } as unknown as PluginContext;

      await themeNeumorphPlugin.activate(ctx);
      assert.equal(themes.length, 1);
      assert.equal(themes[0].id, NEUMORPH_THEME_ID);
      assert.equal(slots.length, 1);
      assert.ok(NEUMORPH_CSS.includes('.mp-nm-deck'));
      assert.ok(NEUMORPH_CSS.includes('.mp-desktop-frameless .mp-nm-deck'));

      await withFakeDom({ isDesktop: true, onSetActiveTheme: k => applied.push(k) }, async ({ container }) => {
        const dispose = await themes[0].mountLayout?.(container as unknown as HTMLElement, '#mplay3r');
        assert.ok(typeof dispose === 'function');
        assert.ok(container.querySelectorAll('[data-tauri-drag-region]').length >= 2);

        const triggers = container.querySelectorAll('ds-trigger');
        const actions = triggers.map(t => t.getAttribute('action'));
        assert.ok(actions.includes('toggleAlwaysOnTop'));
        assert.ok(actions.includes('minimizeWindow'));
        assert.ok(actions.includes('closeWindow'));
        assert.ok(actions.includes('togglePlay'));

        // Toggle Light -> Dark mode and verify persistence in ctx.storage
        const modeBtn = container.querySelectorAll('.mp-nm-pill')[0];
        assert.ok(modeBtn);
        modeBtn.click();
        assert.equal(await storage.get('neumorphMode'), 'dark');

        // Verify switcher panel can re-apply theme and reset to Minimal
        const panelEl = new FakeElement('div');
        const disposePanel = await slots[0].mount(panelEl as unknown as HTMLElement, '#mplay3r');
        const panelBtns = panelEl.querySelectorAll('button');
        assert.equal(panelBtns.length, 2);
        panelBtns[0].click();
        panelBtns[1].click();
        await Promise.resolve();
        assert.deepEqual(applied, [NEUMORPH_THEME_KEY, null]);

        if (typeof disposePanel === 'function') disposePanel();
        dispose();
        assert.equal(listenerCount, 0);
        assert.equal(container.children.length, 0);
      });
    });
  });

  describe('Seventies Vintage Hi-Fi Theme (mplay3r.theme-seventies)', () => {
    it('drives dual analog VU needles via getAudioAnalyser(), renders frameless drag & desktop controls, and cancels RAF on unmount', async () => {
      const themes: PluginThemeDescriptor[] = [];
      const slots: PluginSlotDescriptor[] = [];
      let analyserRequested = 0;
      let listenerCount = 0;

      const fakeAnalyser = {
        frequencyBinCount: 64,
        getByteFrequencyData(arr: Uint8Array) {
          arr.fill(180);
        },
      } as unknown as AnalyserNode;

      const ctx = {
        manifest: themeSeventiesPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        playback: {
          seek: async () => undefined,
          setVolume: async () => undefined,
        },
        getState: () => makeSnapshot('playing'),
        getAudioAnalyser: async () => {
          analyserRequested += 1;
          return fakeAnalyser;
        },
        on: () => {
          listenerCount += 1;
          return () => {
            listenerCount -= 1;
          };
        },
        registerTheme: (t: PluginThemeDescriptor) => {
          themes.push(t);
          return () => undefined;
        },
        registerSlot: (s: PluginSlotDescriptor) => {
          slots.push(s);
          return () => undefined;
        },
      } as unknown as PluginContext;

      await themeSeventiesPlugin.activate(ctx);
      assert.equal(themes.length, 1);
      assert.equal(themes[0].id, SEVENTIES_THEME_ID);
      assert.equal(SEVENTIES_THEME_KEY, 'mplay3r.theme-seventies:seventies-hifi');
      assert.equal(slots.length, 1);
      assert.ok(SEVENTIES_CSS.includes('.mp-70-wood'));
      assert.ok(SEVENTIES_CSS.includes('.mp-70-vu'));

      await withFakeDom({ isDesktop: true }, async ({ container, triggerRaf, cancelledRafs }) => {
        const dispose = await themes[0].mountLayout?.(container as unknown as HTMLElement, '#mplay3r');
        assert.ok(typeof dispose === 'function');
        await Promise.resolve();
        assert.ok(analyserRequested >= 1);

        assert.ok(container.querySelectorAll('[data-tauri-drag-region]').length >= 2);
        const needles = container.querySelectorAll('.mp-70-needle');
        assert.equal(needles.length, 2);

        // Run a couple animation frames so needles sweep upward with audio energy
        triggerRaf();
        triggerRaf();
        assert.match(needles[0].style.transform, /rotate\(-?\d+deg\)/);

        const actions = container.querySelectorAll('ds-trigger').map(t => t.getAttribute('action'));
        assert.ok(actions.includes('toggleAlwaysOnTop'));
        assert.ok(actions.includes('minimizeWindow'));
        assert.ok(actions.includes('closeWindow'));
        assert.ok(actions.includes('toggleShuffle'));
        assert.ok(actions.includes('cycleRepeat'));

        dispose();
        assert.ok(cancelledRafs.length >= 1, 'Expected active RAF loop to be cancelled on unmount');
        assert.equal(listenerCount, 0);
        assert.equal(container.children.length, 0);
      });
    });
  });

  describe('Cyberpunk Neon Jukebox Theme (mplay3r.theme-cyberpunk-jukebox)', () => {
    it('renders glowing arch, spinning holo-disc + laser arm, live FFT canvas, A1/A2 selector grid, and cleans up RAF without interrupting audio', async () => {
      const themes: PluginThemeDescriptor[] = [];
      const slots: PluginSlotDescriptor[] = [];
      let stopCalls = 0;
      let pauseCalls = 0;
      let listenerCount = 0;

      const fakeAnalyser = {
        frequencyBinCount: 64,
        getByteFrequencyData(arr: Uint8Array) {
          for (let i = 0; i < arr.length; i += 1) arr[i] = 140 + (i % 60);
        },
      } as unknown as AnalyserNode;

      const ctx = {
        manifest: themeCyberpunkPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        playback: {
          stop: async () => {
            stopCalls += 1;
          },
          pause: async () => {
            pauseCalls += 1;
          },
          seek: async () => undefined,
          setVolume: async () => undefined,
        },
        getState: () => makeSnapshot('playing'),
        getAudioAnalyser: async () => fakeAnalyser,
        on: () => {
          listenerCount += 1;
          return () => {
            listenerCount -= 1;
          };
        },
        registerTheme: (t: PluginThemeDescriptor) => {
          themes.push(t);
          return () => undefined;
        },
        registerSlot: (s: PluginSlotDescriptor) => {
          slots.push(s);
          return () => undefined;
        },
      } as unknown as PluginContext;

      await themeCyberpunkPlugin.activate(ctx);
      assert.equal(themes.length, 1);
      assert.equal(themes[0].id, CYBERPUNK_THEME_ID);
      assert.equal(CYBERPUNK_THEME_KEY, 'mplay3r.theme-cyberpunk-jukebox:cyberpunk-jukebox');
      assert.equal(slots.length, 1);
      assert.ok(CYBERPUNK_CSS.includes('.mp-cp-arch'));
      assert.ok(CYBERPUNK_CSS.includes('.mp-cp-disc'));
      assert.ok(CYBERPUNK_CSS.includes('.mp-cp-laser'));

      await withFakeDom({ isDesktop: true }, async ({ container, triggerRaf, cancelledRafs }) => {
        const dispose = await themes[0].mountLayout?.(container as unknown as HTMLElement, '#mplay3r');
        assert.ok(typeof dispose === 'function');
        await Promise.resolve();

        // Draggable glowing neon arch & HUD
        assert.ok(container.querySelectorAll('[data-tauri-drag-region]').length >= 3);
        assert.equal(container.querySelectorAll('.mp-cp-disc').length, 1);
        assert.equal(container.querySelectorAll('.mp-cp-laser').length, 1);

        // Illuminated A1, A2 track selector tiles
        const codes = container.querySelectorAll('.mp-cp-code').map(el => el.textContent);
        assert.deepEqual(codes, ['A1', 'A2']);

        // Live FFT canvas drawing
        const canvas = container.querySelector('canvas');
        assert.ok(canvas);
        triggerRaf();
        assert.ok(canvas.fillRectCalls > 10, 'Expected neon FFT bars & peaks drawn onto canvas');

        // Frameless desktop window actions
        const actions = container.querySelectorAll('ds-trigger').map(t => t.getAttribute('action'));
        assert.ok(actions.includes('toggleAlwaysOnTop'));
        assert.ok(actions.includes('minimizeWindow'));
        assert.ok(actions.includes('closeWindow'));
        assert.ok(actions.includes('togglePlay'));

        dispose();
        assert.ok(cancelledRafs.length >= 1, 'Expected neon FFT RAF loop cancelled on unmount');
        assert.equal(listenerCount, 0);
        assert.equal(stopCalls, 0);
        assert.equal(pauseCalls, 0);
        assert.equal(container.children.length, 0);
      });
    });
  });
});
