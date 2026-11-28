import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import themePrismGlassPlugin from '../plugins/theme-prism-glass/src/index';
import {
  computeGlassProgress,
  filterPrismTracks,
  formatGlassRemaining,
  PRISM_GLASS_CSS,
  PRISM_GLASS_THEME_ID,
  PRISM_GLASS_THEME_KEY,
  PRISM_HERO_ART_SVG,
} from '../plugins/theme-prism-glass/src/prism-glass';
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
  title = '';
  type = '';
  placeholder = '';
  min = '';
  max = '';
  step = '';
  value = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attrs = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<() => void>>();
  private htmlMarkup = '';

  constructor(tag: string) {
    this.tagName = tag.toLowerCase();
  }

  set innerHTML(val: string) {
    this.htmlMarkup = val;
    if (val === '') {
      this.children = [];
    }
  }

  get innerHTML(): string {
    return this.htmlMarkup || this.children.map(c => `<${c.tagName}>${c.textContent}</${c.tagName}>`).join('');
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

  dispatch(event: string): void {
    for (const fn of this.listeners.get(event) ?? []) {
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
}

function withFakeDom<T>(
  opts: { isDesktop?: boolean; onSetActiveTheme?: (key: string | null) => void },
  run: (container: FakeElement) => Promise<T> | T,
): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const prevDocument = g.document;
  const prevTauri = g.__TAURI_INTERNALS__;

  const fakeHostEl = {
    getPluginHost: async () => ({
      setActiveTheme: (key: string | null) => opts.onSetActiveTheme?.(key),
    }),
  };

  g.document = {
    createElement: (tag: string) => new FakeElement(tag),
    querySelector: () => fakeHostEl,
  };
  if (opts.isDesktop) {
    g.__TAURI_INTERNALS__ = { invoke: async () => undefined };
  } else {
    delete g.__TAURI_INTERNALS__;
  }

  const container = new FakeElement('div');
  return Promise.resolve()
    .then(() => run(container))
    .finally(() => {
      if (prevDocument === undefined) delete g.document;
      else g.document = prevDocument;
      if (prevTauri === undefined) delete g.__TAURI_INTERNALS__;
      else g.__TAURI_INTERNALS__ = prevTauri;
    });
}

function makeSnapshot(): PlayerSnapshot {
  return {
    status: 'playing',
    currentTrack: {
      id: 't1',
      src: 'https://example.com/psychodelic.mp3',
      title: 'Psychodelic',
      artist: 'D3m0n X Diablo',
      duration: 240,
      format: 'MP3',
    },
    currentIndex: 0,
    tracks: [
      {
        id: 't1',
        src: 'https://example.com/psychodelic.mp3',
        title: 'Psychodelic',
        artist: 'D3m0n X Diablo',
        duration: 240,
      },
      {
        id: 't2',
        src: 'https://example.com/shape.mp3',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        duration: 233,
      },
      {
        id: 't3',
        src: 'https://example.com/secrets.mp3',
        title: 'Secrets',
        artist: 'Tiesto & KSHMR',
        duration: 218,
      },
    ],
    currentTime: 54,
    duration: 240,
    buffered: 180,
    volume: 0.8,
    muted: false,
    balance: 0,
    shuffle: false,
    repeat: 'off',
    showRemaining: true,
    palette: 'obsidian',
    showEqualizer: false,
    showPlaylist: true,
    compact: false,
  };
}

describe('PR #22 — Prism Glass Periwinkle Theme (mplay3r.theme-prism-glass)', () => {
  it('formats negative remaining timestamps (-3:06), clamps progress, and filters Collections & search queries', () => {
    assert.equal(formatGlassRemaining(54, 240), '-3:06');
    assert.equal(formatGlassRemaining(240, 240), '-0:00');
    assert.equal(formatGlassRemaining(300, 240), '-0:00');
    assert.equal(formatGlassRemaining(Number.NaN, 240), '-4:00');

    assert.equal(Math.round(computeGlassProgress(54, 240)), 23);
    assert.equal(computeGlassProgress(500, 240), 100);
    assert.equal(computeGlassProgress(-10, 240), 0);
    assert.equal(computeGlassProgress(10, 0), 0);

    const tracks = makeSnapshot().tracks;
    assert.equal(filterPrismTracks(tracks, 'all', '').length, 3);
    assert.equal(filterPrismTracks(tracks, 'chill', '').length, 2);
    assert.equal(filterPrismTracks(tracks, 'focus', '').length, 1);
    assert.deepEqual(
      filterPrismTracks(tracks, 'all', 'tiesto').map(item => item.track.title),
      ['Secrets'],
    );
  });

  it('activates, mounts Listen Now + Collections/Recommended glass cards, persists view mode, and wires frameless Desktop triggers', async () => {
    const storage = createMemoryStorage();
    const themes: PluginThemeDescriptor[] = [];
    const slots: PluginSlotDescriptor[] = [];
    const applied: Array<string | null> = [];
    let listenerCount = 0;

    const ctx = {
      manifest: themePrismGlassPlugin.manifest,
      playerTarget: '#mplay3r',
      coreVersion: '0.1.0',
      storage,
      playback: {
        togglePlay: async () => undefined,
        seek: async () => undefined,
        setVolume: async () => undefined,
      },
      getState: () => makeSnapshot(),
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

    await themePrismGlassPlugin.activate(ctx);
    assert.equal(themes.length, 1);
    assert.equal(themes[0].id, PRISM_GLASS_THEME_ID);
    assert.equal(PRISM_GLASS_THEME_KEY, 'mplay3r.theme-prism-glass:prism-glass');
    assert.equal(slots.length, 1);
    assert.ok(PRISM_GLASS_CSS.includes('backdrop-filter: blur(22px)'));
    assert.ok(PRISM_GLASS_CSS.includes('.mp-pg-mini'));
    assert.ok(PRISM_HERO_ART_SVG.includes('<svg'));

    await withFakeDom({ isDesktop: true, onSetActiveTheme: k => applied.push(k) }, async container => {
      const dispose = await themes[0].mountLayout?.(container as unknown as HTMLElement, '#mplay3r');
      assert.ok(typeof dispose === 'function');

      assert.ok(container.querySelectorAll('[data-tauri-drag-region]').length >= 3);
      assert.equal(container.querySelectorAll('.mp-pg-card').length, 2);
      assert.equal(container.querySelector('.mp-pg-title')?.textContent, 'Psychodelic');
      assert.equal(container.querySelector('.mp-pg-remaining')?.textContent, '-3:06');
      assert.equal(container.querySelector('.mp-pg-mini-title')?.textContent, 'Psychodelic');
      assert.equal(container.querySelectorAll('.mp-pg-coll').length, 3);
      assert.equal(container.querySelectorAll('.mp-pg-row').length, 3);

      // Search filtering inside Collections & Recommended card
      const searchInput = container.querySelector('.mp-pg-search-input');
      assert.ok(searchInput);
      searchInput.value = 'sheeran';
      searchInput.dispatch('input');
      assert.equal(container.querySelectorAll('.mp-pg-row').length, 1);

      // Toggle library view button -> persists in storage
      const ringBtns = container.querySelectorAll('.mp-pg-ring-btn');
      assert.ok(ringBtns.length >= 2);
      ringBtns[1].click(); // Dots menu button opens library view
      assert.equal(await storage.get('prismGlassView'), 'library');

      // Verify Desktop frameless & playback ds-trigger actions
      const actions = container.querySelectorAll('ds-trigger').map(t => t.getAttribute('action'));
      assert.ok(actions.includes('previous'));
      assert.ok(actions.includes('togglePlay'));
      assert.ok(actions.includes('next'));
      assert.ok(actions.includes('openFilePicker'));
      assert.ok(actions.includes('toggleAlwaysOnTop'));
      assert.ok(actions.includes('minimizeWindow'));
      assert.ok(actions.includes('closeWindow'));

      // Verify ui-slot switcher panel re-applies Prism Glass & resets to Minimal
      const panelEl = new FakeElement('div');
      const disposePanel = await slots[0].mount(panelEl as unknown as HTMLElement, '#mplay3r');
      const panelBtns = panelEl.querySelectorAll('button');
      assert.equal(panelBtns.length, 2);
      panelBtns[0].click();
      panelBtns[1].click();
      await Promise.resolve();
      assert.deepEqual(applied, [PRISM_GLASS_THEME_KEY, null]);

      if (typeof disposePanel === 'function') disposePanel();
      dispose();
      assert.equal(listenerCount, 0);
      assert.equal(container.children.length, 0);
    });
  });
});
