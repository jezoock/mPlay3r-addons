import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import themeClassicPlugin from '../plugins/theme-classic/src/index';
import { ThemeSwitchController } from '../plugins/theme-classic/src/switcher';
import { formatThemeTime, HIFI_RACK_CSS, WINAMP_CLASSIC_CSS } from '../plugins/theme-classic/src/themes';
import wszSkinsPlugin from '../plugins/wsz-skins/src/index';
import { DEFAULT_PLEDIT, inspectBmpHeader, parsePleditTxt, parseViscolorTxt } from '../plugins/wsz-skins/src/parsers';
import { loadWszSkin, sliceSpriteCss, WINAMP_CBUTTONS_SPRITES } from '../plugins/wsz-skins/src/sprites';
import { extractWszArchive } from '../plugins/wsz-skins/src/zip';
import type { PluginContext, PluginSlotDescriptor, PluginStorage, PluginThemeDescriptor } from '../sdk/types';

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

/** Creates a minimal valid uncompressed 24-bit Windows BMP header + pixel buffer. */
function buildMinimalBmp(width: number, height: number): Uint8Array {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * Math.abs(height);
  const total = 54 + pixelBytes;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  buf[0] = 0x42; // 'B'
  buf[1] = 0x4d; // 'M'
  view.setUint32(2, total, true);
  view.setUint32(10, 54, true); // pixel array offset
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, 24, true); // bpp
  return buf;
}

/** Builds a standards-compliant ZIP / `.wsz` archive supporting Stored (0) and Deflate (8) entries. */
function buildTestZip(entries: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const compressed = entry.deflate ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;
    const method = entry.deflate ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    localParts.push(local);
    cdParts.push(cd);
    offset += local.length;
  }

  const cdSize = cdParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const totalSize = offset + cdSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of [...localParts, ...cdParts, eocd]) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

describe('PR #15 — Structural Themes (Classic / Hi-Fi Rack) & Winamp .wsz Skin Loader', () => {
  describe('pledit.txt, viscolor.txt & BMP header parsers', () => {
    it('parses pledit.txt INI fields and falls back gracefully on invalid or missing values', () => {
      const pledit = parsePleditTxt(`
        [Text]
        Normal=#33FF66 ; classic green
        Current=FFFFFF
        NormalBG=#101218
        SelectedBG=#2040AA
        Font=Verdana
      `);
      assert.equal(pledit.normal, '#33ff66');
      assert.equal(pledit.current, '#ffffff');
      assert.equal(pledit.normalBg, '#101218');
      assert.equal(pledit.selectedBg, '#2040aa');
      assert.equal(pledit.font, 'Verdana');

      const fallback = parsePleditTxt('[Text]\nNormal=not-a-color\nFont=Bad<script>');
      assert.equal(fallback.normal, DEFAULT_PLEDIT.normal);
      assert.equal(fallback.font, DEFAULT_PLEDIT.font);
    });

    it('parses 24-line viscolor.txt with comments, RGB clamping, and partial-file defaults', () => {
      const lines = [
        '10, 12, 16 // background',
        '30, 40, 50 // grid dots',
        '300, 10, 0 // top spectrum bar (clamped to 255)',
        '220, 80, 0',
      ];
      const pal = parseViscolorTxt(lines.join('\r\n'));
      assert.equal(pal.background, 'rgb(10,12,16)');
      assert.equal(pal.gridDots, 'rgb(30,40,50)');
      assert.equal(pal.spectrum.length, 16);
      assert.equal(pal.spectrum[0], 'rgb(255,10,0)');
      assert.equal(pal.spectrum[1], 'rgb(220,80,0)');
      assert.equal(pal.oscilloscope.length, 5);
      assert.ok(pal.peak.startsWith('rgb('));
    });

    it('validates Windows BMP headers and rejects non-BMP or truncated buffers', () => {
      const valid = buildMinimalBmp(275, 116);
      const info = inspectBmpHeader(valid);
      assert.deepEqual(info, { width: 275, height: 116, bitsPerPixel: 24, byteLength: valid.byteLength });

      const topDown = buildMinimalBmp(136, -36);
      assert.equal(inspectBmpHeader(topDown)?.height, 36);

      assert.equal(inspectBmpHeader(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
      assert.equal(inspectBmpHeader(new Uint8Array(10)), null);
    });
  });

  describe('Winamp .wsz decompression, sprite mapping & corruption resilience', () => {
    it('extracts complete Stored + Deflate .wsz archives, slices cbuttons.bmp sprites, and ignores traversal paths', async () => {
      const enc = new TextEncoder();
      const wsz = buildTestZip([
        { name: 'CyberSkin/MAIN.BMP', data: buildMinimalBmp(275, 116), deflate: true },
        { name: 'CyberSkin/cbuttons.bmp', data: buildMinimalBmp(136, 36), deflate: true },
        { name: 'CyberSkin/eqmain.bmp', data: buildMinimalBmp(275, 116), deflate: false },
        { name: 'CyberSkin/pledit.txt', data: enc.encode('[Text]\nNormal=#00EEFF\nFont=Tahoma'), deflate: true },
        { name: 'CyberSkin/viscolor.txt', data: enc.encode('0,0,0\n12,12,12\n0,255,180'), deflate: false },
        { name: '../outside_escape.txt', data: enc.encode('blocked'), deflate: false },
      ]);

      const rawExtracted = await extractWszArchive(wsz);
      assert.equal(rawExtracted.ok, true);
      assert.equal(rawExtracted.files.has('outside_escape.txt'), false);

      const skin = await loadWszSkin(wsz, 'CyberSkin.wsz');
      assert.equal(skin.ok, true);
      assert.equal(skin.warnings.length, 0);
      assert.equal(skin.sprites.main?.info.width, 275);
      assert.equal(skin.sprites.cbuttons?.info.width, 136);
      assert.equal(skin.sprites.eqmain?.info.height, 116);
      assert.equal(skin.pledit.normal, '#00eeff');
      assert.equal(skin.pledit.font, 'Tahoma');
      assert.equal(skin.viscolor.spectrum[0], 'rgb(0,255,180)');

      assert.ok(skin.sprites.cbuttons);
      const playCss = sliceSpriteCss(skin.sprites.cbuttons.url, WINAMP_CBUTTONS_SPRITES.play.normal);
      assert.ok(playCss.includes('background-position:-23px -0px'));
      assert.ok(playCss.includes('width:23px;height:18px'));

      skin.dispose();
    });

    it('handles partial .wsz archives with corrupted BMPs gracefully and rejects non-ZIP archives cleanly', async () => {
      const enc = new TextEncoder();
      const partialWsz = buildTestZip([
        { name: 'main.bmp', data: buildMinimalBmp(275, 116) },
        { name: 'cbuttons.bmp', data: enc.encode('NOT-A-VALID-BMP-FILE') },
      ]);

      const partial = await loadWszSkin(partialWsz, 'Partial.wsz');
      assert.equal(partial.ok, true);
      assert.ok(partial.sprites.main);
      assert.equal(partial.sprites.cbuttons, undefined);
      assert.ok(partial.warnings.some(w => w.includes('cbuttons.bmp')));
      assert.ok(partial.warnings.some(w => w.includes('pledit.txt')));
      partial.dispose();

      // Completely corrupted / non-ZIP bytes fail cleanly without throwing
      const corrupt = await loadWszSkin(enc.encode('This is definitely not a zip archive!'), 'Broken.wsz');
      assert.equal(corrupt.ok, false);
      assert.ok(corrupt.error && corrupt.error.length > 0);
      corrupt.dispose();
    });
  });

  describe('Hot theme switching without audio interruption & plugin activation', () => {
    it('switches hot between Minimal, Winamp Classic 2.x, Hi-Fi Rack, and .wsz without pausing or stopping playback', async () => {
      const storage = createMemoryStorage();
      let playbackStatus: 'playing' | 'paused' | 'stopped' = 'playing';
      let stopCalls = 0;
      let pauseCalls = 0;
      const appliedThemes: Array<string | null> = [];

      const switcher = new ThemeSwitchController(storage, async () => ({
        setActiveTheme(key) {
          appliedThemes.push(key);
        },
      }));

      // Verify hot theme switches persist and never touch playback state
      await switcher.switchTo('mplay3r.theme-classic:winamp-classic');
      await switcher.switchTo('mplay3r.theme-classic:hifi-rack');
      await switcher.switchTo('mplay3r.wsz-skins:wsz-active');
      await switcher.switchTo(null);

      assert.deepEqual(appliedThemes, [
        'mplay3r.theme-classic:winamp-classic',
        'mplay3r.theme-classic:hifi-rack',
        'mplay3r.wsz-skins:wsz-active',
        null,
      ]);
      assert.equal(playbackStatus, 'playing');
      assert.equal(stopCalls, 0);
      assert.equal(pauseCalls, 0);

      // Persists selected theme across reloads
      await switcher.switchTo('mplay3r.theme-classic:hifi-rack');
      const reloaded = new ThemeSwitchController(storage, async () => ({
        setActiveTheme(key) {
          appliedThemes.push(key);
        },
      }));
      assert.equal(await reloaded.load(), 'mplay3r.theme-classic:hifi-rack');

      // Activate both theme plugins & verify registered themes and slots
      const registeredThemes: PluginThemeDescriptor[] = [];
      const registeredSlots: PluginSlotDescriptor[] = [];
      const makeCtx = (manifest: PluginContext['manifest']) =>
        ({
          manifest,
          playerTarget: '#mplay3r',
          coreVersion: '0.1.0',
          storage: createMemoryStorage(),
          playback: {
            stop: async () => {
              stopCalls += 1;
              playbackStatus = 'stopped';
            },
            pause: async () => {
              pauseCalls += 1;
              playbackStatus = 'paused';
            },
          },
          getState: () => ({ status: playbackStatus, currentTime: 42, duration: 180, volume: 0.8, tracks: [], currentIndex: -1 }),
          on: () => () => undefined,
          registerTheme: (t: PluginThemeDescriptor) => {
            registeredThemes.push(t);
            return () => undefined;
          },
          registerSlot: (s: PluginSlotDescriptor) => {
            registeredSlots.push(s);
            return () => undefined;
          },
          fetch: async () => ({ ok: false, status: 404 }) as unknown as Response,
          notify: async () => undefined,
        }) as unknown as PluginContext;

      await themeClassicPlugin.activate(makeCtx(themeClassicPlugin.manifest));
      await wszSkinsPlugin.activate(makeCtx(wszSkinsPlugin.manifest));

      assert.deepEqual(
        registeredThemes.map(t => t.id).sort(),
        ['hifi-rack', 'winamp-classic', 'wsz-active'],
      );
      assert.ok(registeredThemes.every(t => typeof t.mountLayout === 'function'));
      assert.equal(registeredSlots.length, 2);
      assert.equal(stopCalls, 0);
      assert.equal(pauseCalls, 0);
      assert.equal(formatThemeTime(125), '02:05');
      assert.ok(WINAMP_CLASSIC_CSS.includes('.mp-wa-deck'));
      assert.ok(HIFI_RACK_CSS.includes('.mp-hifi-rack'));

      await wszSkinsPlugin.deactivate?.();
    });
  });
});
