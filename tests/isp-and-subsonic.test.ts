import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  BBOX_FM_FALLBACK,
  BBOX_PROVIDER_ID,
  createBboxRadioProvider,
  isBboxRadioEntry,
  normalizeBboxStationName,
  parseBboxRadioPlaylist,
} from '../plugins/radio-bbox/src/bbox-m3u';
import bboxPlugin from '../plugins/radio-bbox/src/index';
import {
  createLiveboxRadioProvider,
  isLiveboxRadioEntry,
  LIVEBOX_FM_FALLBACK,
  LIVEBOX_PROVIDER_ID,
  normalizeLiveboxStationName,
  parseLiveboxRadioPlaylist,
} from '../plugins/radio-livebox/src/livebox-m3u';
import liveboxPlugin from '../plugins/radio-livebox/src/index';
import {
  createSfrRadioProvider,
  isSfrRadioEntry,
  normalizeSfrStationName,
  parseSfrRadioPlaylist,
  SFR_FM_FALLBACK,
  SFR_PROVIDER_ID,
} from '../plugins/radio-sfr/src/sfr-m3u';
import sfrPlugin from '../plugins/radio-sfr/src/index';
import {
  buildSubsonicQuery,
  createSubsonicMediaSourceProvider,
  normalizeSubsonicUrl,
  SUBSONIC_PROVIDER_ID,
  SubsonicClient,
} from '../plugins/source-subsonic/src/client';
import { md5Hex } from '../plugins/source-subsonic/src/md5';
import subsonicPlugin from '../plugins/source-subsonic/src/index';
import type {
  MediaSourceProvider,
  PluginContext,
  PluginSlotDescriptor,
  PluginStorage,
  RadioProvider,
} from '../sdk/types';

function createMemoryStorage(seed: Record<string, unknown> = {}): PluginStorage {
  const map = new Map<string, string>(
    Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]),
  );
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

function createMockContext(opts: {
  storage?: PluginStorage;
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}): {
  ctx: PluginContext;
  providers: Map<string, unknown[]>;
  slots: PluginSlotDescriptor[];
} {
  const providers = new Map<string, unknown[]>();
  const slots: PluginSlotDescriptor[] = [];
  const ctx: PluginContext = {
    manifest: {
      id: 'test.mock',
      name: 'Test Mock',
      version: '1.0.0',
      description: 'Mock context for unit tests',
      category: 'source',
      permissions: ['network', 'storage', 'playlist-write', 'playback-control', 'ui-slot'],
    },
    playerTarget: '#mplay3r',
    coreVersion: '0.1.0',
    storage: opts.storage ?? createMemoryStorage(),
    fetch: (input, init) =>
      opts.fetcher ? opts.fetcher(input, init) : Promise.reject(new Error('Network disabled in test')),
    on: () => () => undefined,
    getState: () => ({
      status: 'stopped',
      currentIndex: -1,
      currentTrack: null,
      tracks: [],
      currentTime: 0,
      duration: 0,
      buffered: 0,
      volume: 0.8,
      muted: false,
      balance: 0,
      shuffle: false,
      repeat: 'off',
      showRemaining: false,
      palette: 'slate',
      showEqualizer: false,
      showPlaylist: false,
      compact: false,
    }),
    updateTrackMetadata: async () => true,
    playlist: {
      addTracks: async () => [],
      removeTrack: async () => undefined,
      clearPlaylist: async () => undefined,
    },
    playback: {
      play: async () => undefined,
      pause: async () => undefined,
      togglePlay: async () => undefined,
      stop: async () => undefined,
      next: async () => undefined,
      previous: async () => undefined,
      seek: async () => undefined,
      setVolume: async () => undefined,
      getStatus: () => 'stopped',
    },
    registerSlot: desc => {
      slots.push(desc);
      return () => undefined;
    },
    registerTheme: () => () => undefined,
    registerProvider: (kind, provider) => {
      const list = providers.get(kind) ?? [];
      list.push(provider);
      providers.set(kind, list);
      return () => undefined;
    },
    getProviders: kind => (providers.get(kind) ?? []) as never[],
    notify: async () => undefined,
    getAudioAnalyser: async () => null,
    getAudioContext: async () => null,
  };
  return { ctx, providers, slots };
}

describe('PR #17 — ISP Box Radio Micro-Plugins (Bbox, Livebox, SFR)', () => {
  describe('mplay3r.radio-bbox (Bouygues Bbox)', () => {
    it('filters radio entries from TV channels, strips prefixes/quality tags, and deduplicates', () => {
      const sample = [
        '#EXTM3U',
        '#EXTINF:-1 group-title="TV",1 - TF1 (HD)',
        'http://mabbox.bytel.fr/tv/tf1.ts',
        '#EXTINF:-1 group-title="Radios",601 - RTL (standard)',
        'http://mabbox.bytel.fr/radio/rtl.mp3',
        '#EXTINF:-1,601 - RTL (HD)',
        'http://mabbox.bytel.fr/radio/rtl-hd.mp3',
        '#EXTINF:-1,802 - FIP (bas débit)',
        'rtsp://mabbox.bytel.fr/stream?id=802&type=radio',
        '#EXTINF:-1 group-title="Radios",Bad Scheme Radio',
        'javascript:alert(1)',
      ].join('\n');

      assert.equal(isBboxRadioEntry('1 - TF1 (HD)', 'http://mabbox.bytel.fr/tv/tf1.ts', 'TV'), false);
      assert.equal(isBboxRadioEntry('601 - RTL', 'http://mabbox.bytel.fr/s', 'Radios'), true);
      assert.equal(normalizeBboxStationName('601 - RTL (standard)'), 'RTL');

      const parsed = parseBboxRadioPlaylist(sample);
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].name, 'RTL');
      assert.equal(parsed[0].providerId, BBOX_PROVIDER_ID);
      assert.equal(parsed[0].isLive, true);
      assert.equal(parsed[1].name, 'FIP');
      assert.equal(parsed[1].codec, 'RTSP');
    });

    it('falls back to curated French FM IP streams when outside a Bbox LAN and activates cleanly', async () => {
      const provider = createBboxRadioProvider(async () => {
        throw new Error('EHOSTUNREACH');
      });
      assert.ok(provider.listFeatured);
      const featured = await provider.listFeatured();
      assert.equal(featured.length, BBOX_FM_FALLBACK.length);
      const jazz = await provider.searchStations('jazz');
      assert.equal(jazz.length, 1);
      assert.equal(jazz[0].name, 'TSF Jazz');

      let fetchedUrl = '';
      const { ctx, providers } = createMockContext({
        storage: createMemoryStorage({ playlistUrl: 'http://192.168.1.254/custom-bbox.m3u' }),
        fetcher: async url => {
          fetchedUrl = String(url);
          return new Response(
            '#EXTM3U\n#EXTINF:-1 group-title="Radios",610 - Radio Nova\nhttp://192.168.1.254/radio/nova.mp3\n',
            { status: 200 },
          );
        },
      });
      await bboxPlugin.activate(ctx);
      const registered = (providers.get('radio') ?? []) as RadioProvider[];
      assert.equal(registered.length, 1);
      assert.equal(registered[0].id, BBOX_PROVIDER_ID);
      assert.ok(registered[0].listFeatured);
      const list = await registered[0].listFeatured();
      assert.equal(fetchedUrl, 'http://192.168.1.254/custom-bbox.m3u');
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Radio Nova');
    });
  });

  describe('mplay3r.radio-livebox (Orange Livebox)', () => {
    it('parses Orange Livebox radio bouquet, falls back outside LAN, and activates cleanly', async () => {
      const sample = [
        '#EXTM3U',
        '#EXTINF:-1 group-title="TV",2 - France 2 (HD)',
        'http://livebox.home/tv/f2.ts',
        '#EXTINF:-1,901 - France Culture (Livebox)',
        'http://livebox.home/radio/culture.aac',
        '#EXTINF:-1 group-title="Radios",902 - OÜI FM (AAC)',
        'http://livebox.home/stream?id=902&type=radio',
      ].join('\n');

      assert.equal(isLiveboxRadioEntry('2 - France 2', 'http://livebox.home/tv/f2.ts', 'TV'), false);
      assert.equal(normalizeLiveboxStationName('901 - France Culture (Livebox)'), 'France Culture');

      const parsed = parseLiveboxRadioPlaylist(sample);
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].name, 'France Culture');
      assert.equal(parsed[1].name, 'OÜI FM');
      assert.equal(parsed[1].providerId, LIVEBOX_PROVIDER_ID);

      const fallbackProvider = createLiveboxRadioProvider(async () => new Response('', { status: 404 }));
      assert.ok(fallbackProvider.listFeatured);
      const featured = await fallbackProvider.listFeatured();
      assert.equal(featured.length, LIVEBOX_FM_FALLBACK.length);
      const rock = await fallbackProvider.searchStations('', { genre: 'Rock' });
      assert.ok(rock.some(st => st.name === 'OÜI FM'));

      const { ctx, providers } = createMockContext({});
      await liveboxPlugin.activate(ctx);
      const registered = (providers.get('radio') ?? []) as RadioProvider[];
      assert.equal(registered.length, 1);
      assert.equal(registered[0].id, LIVEBOX_PROVIDER_ID);
    });
  });

  describe('mplay3r.radio-sfr (SFR Box / Neufbox)', () => {
    it('parses SFR multiposte radios, falls back outside LAN, and activates cleanly', async () => {
      const sample = [
        '#EXTM3U',
        '#EXTINF:-1 group-title="TV",3 - France 3 (HD)',
        'rtsp://neufbox/tv/f3',
        '#EXTINF:-1,801 - RMC Info Talk Sport (SFR)',
        'rtsp://neufbox/radio/rmc',
        '#EXTINF:-1 group-title="Radios",802 - BFM Business (Neufbox)',
        'http://neufbox/stream?type=radio&ch=802',
      ].join('\n');

      assert.equal(isSfrRadioEntry('3 - France 3', 'rtsp://neufbox/tv/f3', 'TV'), false);
      assert.equal(normalizeSfrStationName('802 - BFM Business (Neufbox)'), 'BFM Business');

      const parsed = parseSfrRadioPlaylist(sample);
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].name, 'RMC Info Talk Sport');
      assert.equal(parsed[0].codec, 'RTSP');
      assert.equal(parsed[1].name, 'BFM Business');
      assert.equal(parsed[1].providerId, SFR_PROVIDER_ID);

      const fallbackProvider = createSfrRadioProvider(async () => {
        throw new Error('timeout');
      });
      assert.ok(fallbackProvider.listFeatured);
      const featured = await fallbackProvider.listFeatured();
      assert.equal(featured.length, SFR_FM_FALLBACK.length);
      const classic = await fallbackProvider.searchStations('classique');
      assert.equal(classic.length, 1);
      assert.equal(classic[0].name, 'Radio Classique');

      const { ctx, providers } = createMockContext({});
      await sfrPlugin.activate(ctx);
      const registered = (providers.get('radio') ?? []) as RadioProvider[];
      assert.equal(registered.length, 1);
      assert.equal(registered[0].id, SFR_PROVIDER_ID);
    });
  });
});

describe('PR #17 — Plugin mplay3r.source-subsonic (OpenSubsonic / Navidrome)', () => {
  it('computes exact RFC 1321 MD5 digests including the official Subsonic API salt vector', () => {
    assert.equal(md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(md5Hex('a'), '0cc175b9c0f1b6a831c399e269772661');
    assert.equal(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(md5Hex('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0');
    // Official Subsonic API docs vector: md5("sesame" + "c19b2d")
    assert.equal(md5Hex('sesamec19b2d'), '26719a1196d2a940705a59634eb18eab');

    // UTF-8 accented string cross-checked against Node crypto
    const utf8Sample = 'Mélodie-Été-2026!salt99';
    const expected = createHash('md5').update(utf8Sample, 'utf8').digest('hex');
    assert.equal(md5Hex(utf8Sample), expected);
  });

  it('normalizes Subsonic base URLs safely and rejects non-HTTP(S) schemes', () => {
    assert.equal(normalizeSubsonicUrl('https://music.example.com/rest/'), 'https://music.example.com');
    assert.equal(normalizeSubsonicUrl('http://192.168.1.42:4533/navidrome/rest'), 'http://192.168.1.42:4533/navidrome');
    assert.equal(normalizeSubsonicUrl('navidrome.local:4533/'), 'https://navidrome.local:4533');
    assert.equal(normalizeSubsonicUrl('ftp://music.example.com'), null);
    assert.equal(normalizeSubsonicUrl('javascript:alert(1)'), null);
    assert.equal(normalizeSubsonicUrl('file:///etc/passwd'), null);
    assert.equal(normalizeSubsonicUrl('   '), null);
  });

  it('builds salted MD5 query parameters without ever exposing the plaintext password', () => {
    const params = buildSubsonicQuery(
      {
        baseUrl: 'https://navidrome.example.com',
        username: 'alice',
        password: 'sesame-secret-password',
      },
      { id: 'song-42' },
      'c19b2d',
    );
    assert.equal(params.get('u'), 'alice');
    assert.equal(params.get('s'), 'c19b2d');
    assert.equal(params.get('t'), md5Hex('sesame-secret-passwordc19b2d'));
    assert.equal(params.get('f'), 'json');
    assert.equal(params.get('id'), 'song-42');
    assert.equal(params.get('p'), null);
    assert.equal(params.toString().includes('sesame-secret-password'), false);
  });

  it('handles ping, search3, playlists, random songs, stream/cover URLs, and Subsonic auth errors', async () => {
    const seenUrls: string[] = [];
    const client = new SubsonicClient(async url => {
      const href = String(url);
      seenUrls.push(href);
      const parsed = new URL(href);
      if (parsed.pathname.endsWith('/rest/ping.view')) {
        if (parsed.searchParams.get('u') === 'baduser') {
          return new Response(
            JSON.stringify({
              'subsonic-response': {
                status: 'failed',
                version: '1.16.1',
                error: { code: 40, message: 'Wrong username or password' },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              version: '1.16.1',
              type: 'navidrome',
              openSubsonic: true,
            },
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname.endsWith('/rest/search3.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              searchResult3: {
                song: [
                  {
                    id: 'tr-1',
                    title: 'Veridis Quo',
                    artist: 'Daft Punk',
                    album: 'Discovery',
                    duration: 345,
                    suffix: 'flac',
                    coverArt: 'al-1',
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname.endsWith('/rest/getPlaylists.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              playlists: {
                playlist: [{ id: 'pl-1', name: 'French Touch', songCount: 12 }],
              },
            },
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname.endsWith('/rest/getPlaylist.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              playlist: {
                id: 'pl-1',
                name: 'French Touch',
                entry: [{ id: 'tr-2', title: 'Voyager', artist: 'Daft Punk', duration: 227, suffix: 'mp3' }],
              },
            },
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname.endsWith('/rest/getRandomSongs.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              randomSongs: {
                song: [{ id: 'tr-3', title: 'Nightcall', artist: 'Kavinsky', duration: 258 }],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    assert.throws(() => client.configure({ baseUrl: 'ftp://bad', username: 'u', password: 'p' }));
    assert.throws(() => client.configure({ baseUrl: 'https://ok.local', username: '', password: 'p' }));

    client.configure({
      baseUrl: 'https://navidrome.local/rest/',
      username: 'jezoock',
      password: 'sesame',
      maxBitRate: 320,
    });

    const okPing = await client.ping();
    assert.equal(okPing.ok, true);
    assert.equal(okPing.serverType, 'navidrome');
    assert.equal(okPing.openSubsonic, true);

    const songs = await client.searchSongs('Veridis');
    assert.equal(songs.length, 1);
    assert.equal(songs[0].title, 'Veridis Quo');

    const playlists = await client.getPlaylists();
    assert.equal(playlists.length, 1);
    assert.equal(playlists[0].name, 'French Touch');

    const entries = await client.getPlaylistSongs('pl-1');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, 'Voyager');

    const streamUrl = client.getStreamUrl('tr-1', 'c19b2d');
    assert.ok(streamUrl.startsWith('https://navidrome.local/rest/stream.view?'));
    assert.ok(streamUrl.includes('t=26719a1196d2a940705a59634eb18eab'));
    assert.ok(streamUrl.includes('maxBitRate=320'));
    assert.equal(streamUrl.includes('sesame'), false);

    const coverUrl = client.getCoverArtUrl('al-1', 300, 'c19b2d');
    assert.ok(coverUrl.includes('/rest/getCoverArt.view?'));
    assert.ok(coverUrl.includes('id=al-1'));

    const provider = createSubsonicMediaSourceProvider(client);
    assert.equal(provider.id, SUBSONIC_PROVIDER_ID);
    const searchItems = await provider.search('Veridis');
    assert.equal(searchItems.length, 1);
    assert.equal(searchItems[0].id, 'subsonic:tr-1');
    assert.ok(searchItems[0].artworkUrl?.includes('getCoverArt.view'));

    const randomItems = await provider.search('');
    assert.equal(randomItems.length, 1);
    assert.equal(randomItems[0].title, 'Nightcall');

    // Error code 40 authentication failure
    client.configure({ baseUrl: 'https://navidrome.local', username: 'baduser', password: 'wrong' });
    const badPing = await client.ping();
    assert.equal(badPing.ok, false);
    assert.match(badPing.errorMessage || '', /Subsonic error 40/);

    // Verify no outgoing request ever leaked a plaintext password
    for (const u of seenUrls) {
      assert.equal(u.includes('sesame'), false);
    }
  });

  it('activates with persisted configuration and registers MediaSourceProvider + UI panel slot', async () => {
    const { ctx, providers, slots } = createMockContext({
      storage: createMemoryStorage({
        subsonicConfig: {
          baseUrl: 'http://192.168.1.50:4533',
          username: 'jezoock',
          password: 'sesame',
        },
      }),
      fetcher: async () =>
        new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              randomSongs: {
                song: [{ id: 's-1', title: 'Around the World', artist: 'Daft Punk', duration: 429 }],
              },
            },
          }),
          { status: 200 },
        ),
    });

    await subsonicPlugin.activate(ctx);
    assert.equal(slots.length, 1);
    assert.equal(slots[0].id, 'subsonic-panel');
    assert.equal(slots[0].slot, 'panel');

    const mediaProviders = (providers.get('media-source') ?? []) as MediaSourceProvider[];
    assert.equal(mediaProviders.length, 1);
    assert.equal(mediaProviders[0].id, SUBSONIC_PROVIDER_ID);

    const items = await mediaProviders[0].search('');
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Around the World');
    assert.ok(items[0].streamUrl.startsWith('http://192.168.1.50:4533/rest/stream.view?'));
  });
});
