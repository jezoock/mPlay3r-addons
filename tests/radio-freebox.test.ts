import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFreeboxRadioProvider,
  FREEBOX_PROVIDER_ID,
  FREEBOX_PUBLIC_FM_FALLBACK,
  isFreeboxRadioEntry,
  normalizeFreeboxStationName,
  parseFreeboxMultipostePlaylist,
} from '../plugins/radio-freebox/src/freebox-m3u';
import freeboxPlugin from '../plugins/radio-freebox/src/index';
import type { PluginContext, RadioProvider } from '../sdk/types';

const SAMPLE_FREEBOX_M3U = `#EXTM3U
#EXTINF:0,1 - TF1 (HD)
rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?namespace=1&service=201&flavour=hd
#EXTINF:0,2 - France 2 (standard)
rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?namespace=1&service=202&flavour=sd
#EXTINF:0,10001 - France Inter
rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?namespace=1&service=10001
#EXTINF:0,10001 - France Inter (bas débit)
rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?namespace=1&service=10001&flavour=ld
#EXTINF:0 group-title="Radio",10005 - FIP
rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?namespace=1&service=10005
#EXTINF:0,10012 - Radio Nova
http://mafreebox.freebox.fr/freeboxtv/radio/nova.mp3
#EXTINF:0,7 - Arte (HD)
rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?namespace=1&service=207
`;

describe('PR #9 — ISP Box Micro-Plugin mplay3r.radio-freebox', () => {
  it('filters Freebox multiposte M3U to keep only radio channels, strips numbering, and deduplicates variants', () => {
    assert.equal(isFreeboxRadioEntry('1 - TF1 (HD)', 'rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?service=201'), false);
    assert.equal(isFreeboxRadioEntry('10001 - France Inter', 'rtsp://mafreebox.freebox.fr/fbxtv_pub/stream?service=10001'), true);
    assert.equal(isFreeboxRadioEntry('Custom Station', 'http://box/stream', 'Radio'), true);
    assert.equal(normalizeFreeboxStationName('10001 - France Inter (bas débit)'), 'France Inter');

    const stations = parseFreeboxMultipostePlaylist(SAMPLE_FREEBOX_M3U);
    assert.deepEqual(
      stations.map(s => s.name),
      ['France Inter', 'FIP', 'Radio Nova'],
    );
    assert.equal(stations[0].providerId, FREEBOX_PROVIDER_ID);
    assert.equal(stations[0].country, 'FR');
    assert.equal(stations[0].codec, 'RTSP');
    assert.equal(stations[2].codec, 'STREAM');
  });

  it('serves parsed Freebox stations when LAN responds and falls back to public French FM streams when unreachable', async () => {
    const lanProvider = createFreeboxRadioProvider(async () => ({
      ok: true,
      status: 200,
      text: async () => SAMPLE_FREEBOX_M3U,
    }) as unknown as Response);

    const fipOnly = await lanProvider.searchStations('fip');
    assert.equal(fipOnly.length, 1);
    assert.equal(fipOnly[0].name, 'FIP');

    const offlineProvider = createFreeboxRadioProvider(async () => {
      throw new Error('LAN unreachable');
    });
    const fallbackStations = await offlineProvider.listFeatured!();
    assert.equal(fallbackStations.length, FREEBOX_PUBLIC_FM_FALLBACK.length);
    assert.ok(fallbackStations.some(s => s.name === 'France Inter'));
  });

  it('registers its RadioProvider cleanly into PluginHost on activate()', async () => {
    const registered: RadioProvider[] = [];
    const mockCtx = {
      manifest: freeboxPlugin.manifest,
      storage: {
        get: async () => null,
        set: async () => undefined,
        remove: async () => undefined,
        clear: async () => undefined,
      },
      fetch: async () => ({ ok: false, status: 503 }) as unknown as Response,
      registerProvider: (kind: string, provider: RadioProvider) => {
        assert.equal(kind, 'radio');
        registered.push(provider);
        return () => undefined;
      },
    } as unknown as PluginContext;

    await freeboxPlugin.activate(mockCtx);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].id, FREEBOX_PROVIDER_ID);
  });
});
