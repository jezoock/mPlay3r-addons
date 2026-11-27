import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import themeEmberNoirPlugin from '../plugins/theme-ember-noir/src/index';
import {
  computeProgressPercent,
  EMBER_NOIR_CSS,
  EMBER_NOIR_THEME_ID,
  EMBER_NOIR_THEME_KEY,
  EMBER_ROSE_SVG,
  formatEmberTime,
} from '../plugins/theme-ember-noir/src/ember-noir';
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
      id: 'track-low-life',
      src: 'https://example.com/low-life.mp3',
      title: 'Low Life',
      artist: 'Future ft. The Weeknd',
      album: 'EVOL',
      duration: 166,
      format: 'FLAC',
    },
    currentIndex: 1,
    tracks: [
      {
        id: 'track-1',
        src: 'https://example.com/1.mp3',
        title: "Ain't No Time",
        artist: 'Future',
        album: 'EVOL',
        duration: 202,
      },
      {
        id: 'track-low-life',
        src: 'https://example.com/low-life.mp3',
        title: 'Low Life',
        artist: 'Future ft. The Weeknd',
        album: 'EVOL',
        duration: 166,
      },
    ],
    currentTime: 77,
    duration: 166,
    buffered: 130,
    volume: 0.85,
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

describe('PR #21 — Ember Noir Dark Neumorph Theme (mplay3r.theme-ember-noir)', () => {
  it('formats compact m:ss timestamps and clamps ember scrubber progress percentages cleanly', () => {
    assert.equal(formatEmberTime(77), '1:17');
    assert.equal(formatEmberTime(166), '2:46');
    assert.equal(formatEmberTime(0), '0:00');
    assert.equal(formatEmberTime(-12), '0:00');
    assert.equal(formatEmberTime(Number.NaN), '0:00');

    assert.equal(Math.round(computeProgressPercent(77, 166)), 46);
    assert.equal(computeProgressPercent(300, 166), 100);
    assert.equal(computeProgressPercent(-5, 166), 0);
    assert.equal(computeProgressPercent(10, 0), 0);
    assert.equal(computeProgressPercent(Number.NaN, 166), 0);
  });

  it('activates, renders Now Playing + Tracklist cards, persists view mode & favorites, and supports frameless Desktop controls', async () => {
    const storage = createMemoryStorage();
    const themes: PluginThemeDescriptor[] = [];
    const slots: PluginSlotDescriptor[] = [];
    const applied: Array<string | null> = [];
    let listenerCount = 0;
    let togglePlayCalls = 0;

    const ctx = {
      manifest: themeEmberNoirPlugin.manifest,
      playerTarget: '#mplay3r',
      coreVersion: '0.1.0',
      storage,
      playback: {
        togglePlay: async () => {
          togglePlayCalls += 1;
        },
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

    await themeEmberNoirPlugin.activate(ctx);
    assert.equal(themes.length, 1);
    assert.equal(themes[0].id, EMBER_NOIR_THEME_ID);
    assert.equal(EMBER_NOIR_THEME_KEY, 'mplay3r.theme-ember-noir:ember-noir');
    assert.equal(slots.length, 1);
    assert.ok(EMBER_NOIR_CSS.includes('.mp-en-card'));
    assert.ok(EMBER_NOIR_CSS.includes('.mp-desktop-frameless .mp-en-card'));
    assert.ok(EMBER_ROSE_SVG.includes('<svg'));

    await withFakeDom({ isDesktop: true, onSetActiveTheme: k => applied.push(k) }, async container => {
      const dispose = await themes[0].mountLayout?.(container as unknown as HTMLElement, '#mplay3r');
      assert.ok(typeof dispose === 'function');

      // Frameless drag regions & both cards rendered
      assert.ok(container.querySelectorAll('[data-tauri-drag-region]').length >= 4);
      assert.equal(container.querySelectorAll('.mp-en-card').length, 2);
      assert.equal(container.querySelectorAll('.mp-en-disc').length, 2);

      // Verify track metadata and active row highlight
      assert.equal(container.querySelector('.mp-en-title')?.textContent, 'Low Life');
      assert.equal(container.querySelector('.mp-en-artist')?.textContent, 'Future ft. The Weeknd');
      const rows = container.querySelectorAll('.mp-en-row');
      assert.equal(rows.length, 2);
      assert.ok(rows[1].className.includes('--active'));

      // Clicking active row toggles play without errors
      rows[1].click();
      assert.equal(togglePlayCalls, 1);

      // Toggle menu button -> switches to playlist view & persists in storage
      const circleBtns = container.querySelectorAll('.mp-en-circle');
      assert.ok(circleBtns.length >= 4);
      circleBtns[1].click(); // Menu button on Now Playing card
      assert.equal(await storage.get('emberNoirView'), 'playlist');

      // Toggle favorite heart -> persists favorite track ID in storage
      circleBtns[2].click(); // Heart button on Tracklist card
      assert.deepEqual(await storage.get('emberNoirFavorites'), ['track-low-life']);

      // Verify Desktop frameless triggers + core playback triggers
      const actions = container.querySelectorAll('ds-trigger').map(t => t.getAttribute('action'));
      assert.ok(actions.includes('previous'));
      assert.ok(actions.includes('togglePlay'));
      assert.ok(actions.includes('next'));
      assert.ok(actions.includes('openFilePicker'));
      assert.ok(actions.includes('toggleAlwaysOnTop'));
      assert.ok(actions.includes('minimizeWindow'));
      assert.ok(actions.includes('closeWindow'));

      // Verify ui-slot hot switcher panel re-applies Ember Noir & resets to Minimal
      const panelEl = new FakeElement('div');
      const disposePanel = await slots[0].mount(panelEl as unknown as HTMLElement, '#mplay3r');
      const panelBtns = panelEl.querySelectorAll('button');
      assert.equal(panelBtns.length, 2);
      panelBtns[0].click();
      panelBtns[1].click();
      await Promise.resolve();
      assert.deepEqual(applied, [EMBER_NOIR_THEME_KEY, null]);

      if (typeof disposePanel === 'function') disposePanel();
      dispose();
      assert.equal(listenerCount, 0);
      assert.equal(container.children.length, 0);
    });
  });
});
