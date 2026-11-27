import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractIcyFromChunk,
  isHlsStreamUrl,
  parseHlsMasterPlaylist,
  parseIcyMetadata,
} from '../plugins/radio/src/icy';
import { computeReconnectDelayMs, LiveStreamTracker, RadioFavoritesStore } from '../plugins/radio/src/live-controller';
import { createRadioBrowserProvider, mapRadioBrowserStation } from '../plugins/radio/src/radio-browser';
import radioPlugin from '../plugins/radio/src/index';
import type { PluginContext, PluginSlotDescriptor, PluginStorage, RadioProvider, RadioStation } from '../sdk/types';

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

describe('PR #9 — Plugin mplay3r.radio (Web & FM IP Radios)', () => {
  describe('ICY metadata & HLS .m3u8 parsing', () => {
    it('parses ICY StreamTitle (Artist - Track) and StreamUrl cleanly', () => {
      const parsed = parseIcyMetadata("StreamTitle='Daft Punk - Digital Love';StreamUrl='https://fip.fr';\u0000\u0000");
      assert.equal(parsed.streamTitle, 'Daft Punk - Digital Love');
      assert.equal(parsed.artist, 'Daft Punk');
      assert.equal(parsed.title, 'Digital Love');
      assert.equal(parsed.streamUrl, 'https://fip.fr');

      const single = parseIcyMetadata("StreamTitle='France Inter - Journal 13h';");
      assert.equal(single.artist, 'France Inter');
      assert.equal(single.title, 'Journal 13h');

      const plain = parseIcyMetadata("StreamTitle='Live Studio Session';");
      assert.equal(plain.artist, undefined);
      assert.equal(plain.title, 'Live Studio Session');
    });

    it('extracts binary ICY metadata frames using icy-metaint interval', () => {
      const metaInt = 16;
      const metaText = "StreamTitle='Air - La Femme d Argent';";
      const metaBytes = new TextEncoder().encode(metaText);
      const blocks = Math.ceil(metaBytes.length / 16);
      const chunk = new Uint8Array(metaInt + 1 + blocks * 16);
      chunk[metaInt] = blocks;
      chunk.set(metaBytes, metaInt + 1);

      const extracted = extractIcyFromChunk(chunk, metaInt);
      assert.equal(extracted?.artist, 'Air');
      assert.equal(extracted?.title, 'La Femme d Argent');
      assert.equal(extractIcyFromChunk(new Uint8Array(4), metaInt), null);
    });

    it('detects HLS .m3u8 URLs and resolves highest-bandwidth variant from master playlists', () => {
      assert.equal(isHlsStreamUrl('https://stream.radiofrance.fr/fip/fip_hifi.m3u8'), true);
      assert.equal(isHlsStreamUrl('https://cdn.example/hls/live?token=1'), true);
      assert.equal(isHlsStreamUrl('https://icecast.radiofrance.fr/fip-hifi.aac'), false);

      const master = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2"',
        'low/stream.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.2"',
        'high/stream.m3u8',
      ].join('\n');

      const variants = parseHlsMasterPlaylist(master, 'https://stream.example/fip/master.m3u8');
      assert.equal(variants.length, 2);
      assert.equal(variants[0].bandwidth, 192000);
      assert.equal(variants[0].url, 'https://stream.example/fip/high/stream.m3u8');
      assert.equal(variants[1].url, 'https://stream.example/fip/low/stream.m3u8');
    });
  });

  describe('Radio Browser directory mapping & search', () => {
    it('maps valid HTTP(S) stations and rejects unsafe or incomplete entries', async () => {
      const valid = mapRadioBrowserStation({
        stationuuid: 'uuid-fip',
        name: 'FIP',
        url_resolved: 'https://icecast.radiofrance.fr/fip-hifi.aac',
        countrycode: 'fr',
        tags: 'eclectic, jazz, rock',
        bitrate: 192,
        codec: 'aac',
      });
      assert.ok(valid);
      assert.equal(valid.country, 'FR');
      assert.equal(valid.genre, 'eclectic');
      assert.equal(valid.codec, 'AAC');
      assert.equal(valid.isLive, true);

      assert.equal(mapRadioBrowserStation({ name: 'Bad', url: 'javascript:alert(1)' }), null);
      assert.equal(mapRadioBrowserStation({ name: '', url: 'https://ok.example/a.mp3' }), null);

      let requestedUrl = '';
      const provider = createRadioBrowserProvider(async url => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              stationuuid: 'uuid-nova',
              name: 'Radio Nova',
              url_resolved: 'https://novazz.ice.infomaniak.ch/novazz-128.mp3',
              countrycode: 'FR',
              tags: 'eclectic',
              bitrate: 128,
              codec: 'MP3',
            },
          ],
        } as unknown as Response;
      });

      const found = await provider.searchStations('Nova', { country: 'fr', genre: 'eclectic', limit: 10 });
      assert.ok(requestedUrl.includes('name=Nova'));
      assert.ok(requestedUrl.includes('countrycode=FR'));
      assert.ok(requestedUrl.includes('tag=eclectic'));
      assert.equal(found.length, 1);
      assert.equal(found[0].name, 'Radio Nova');
    });
  });

  describe('LIVE state, exponential reconnect backoff & favorites', () => {
    it('tracks live stations, disables seek, applies ICY updates, and backs off reconnects', () => {
      assert.equal(computeReconnectDelayMs(0), 1500);
      assert.equal(computeReconnectDelayMs(1), 3000);
      assert.equal(computeReconnectDelayMs(2), 6000);
      assert.equal(computeReconnectDelayMs(4), 24000);
      assert.equal(computeReconnectDelayMs(5), null);

      const station: RadioStation = {
        id: 'fip',
        name: 'FIP',
        streamUrl: 'https://icecast.radiofrance.fr/fip-hifi.aac',
        providerId: 'radio-browser',
        isLive: true,
      };
      const tracker = new LiveStreamTracker();
      tracker.registerLiveStation(station);

      const live = tracker.onTrackChanged({ id: 't1', src: station.streamUrl });
      assert.equal(live.isLive, true);
      assert.equal(live.seekDisabled, true);

      const updated = tracker.applyIcyMetadata({ streamTitle: 'Miles Davis - So What' });
      assert.equal(updated.nowPlaying, 'Miles Davis - So What');

      assert.equal(tracker.scheduleReconnect({ baseMs: 1000, maxMs: 5000, maxAttempts: 3 }), 1000);
      assert.equal(tracker.scheduleReconnect({ baseMs: 1000, maxMs: 5000, maxAttempts: 3 }), 2000);
      assert.equal(tracker.scheduleReconnect({ baseMs: 1000, maxMs: 5000, maxAttempts: 3 }), 4000);
      assert.equal(tracker.scheduleReconnect({ baseMs: 1000, maxMs: 5000, maxAttempts: 3 }), null);

      tracker.markRecovered();
      assert.equal(tracker.getState().reconnecting, false);
      assert.equal(tracker.getState().reconnectAttempt, 0);

      // Switching to a local non-radio file clears LIVE state and re-enables seeking.
      const localState = tracker.onTrackChanged({ id: 't2', src: 'blob:local-song' });
      assert.equal(localState.isLive, false);
      assert.equal(localState.seekDisabled, false);
    });

    it('persists favorite stations through PluginStorage', async () => {
      const storage = createMemoryStorage();
      const favs = new RadioFavoritesStore(storage);
      const station: RadioStation = {
        id: 'fip',
        name: 'FIP',
        streamUrl: 'https://icecast.radiofrance.fr/fip-hifi.aac',
        providerId: 'radio-browser',
      };

      assert.equal(await favs.toggle(station), true);
      assert.equal(favs.has('fip'), true);

      const reloaded = new RadioFavoritesStore(storage);
      await reloaded.load();
      assert.equal(reloaded.has('fip'), true);
      assert.equal(await reloaded.toggle(station), false);
      assert.equal(reloaded.list().length, 0);
    });
  });

  describe('plugin activation & cross-plugin RadioProvider discovery', () => {
    it('registers Radio Browser provider, panel & track-info slots, and discovers installed box providers', async () => {
      const providers: RadioProvider[] = [];
      const slots: PluginSlotDescriptor[] = [];
      const mockCtx = {
        manifest: radioPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        on: () => () => undefined,
        registerProvider: (_kind: 'radio', provider: RadioProvider) => {
          providers.push(provider);
          return () => undefined;
        },
        getProviders: () => providers,
        registerSlot: (slot: PluginSlotDescriptor) => {
          slots.push(slot);
          return () => undefined;
        },
        fetch: async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response,
        notify: async () => undefined,
      } as unknown as PluginContext;

      await radioPlugin.activate(mockCtx);
      assert.equal(providers.length, 1);
      assert.equal(providers[0].id, 'radio-browser');
      assert.deepEqual(
        slots.map(s => s.slot).sort(),
        ['panel', 'track-info'],
      );
      await radioPlugin.deactivate?.();
    });
  });
});
