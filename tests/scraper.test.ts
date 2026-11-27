import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import scraperPlugin from '../plugins/scraper/src/index';
import { findActiveLrcLineIndex, getActiveLrcWindow, parseLrc } from '../plugins/scraper/src/lrc';
import { cleanTrackField, normalizeTrackQuery } from '../plugins/scraper/src/normalize';
import { MetadataScraperService, PoliteRateLimiter, ScraperCacheStore } from '../plugins/scraper/src/providers';
import type { PluginContext, PluginSlotDescriptor, PluginStorage, TrackMetadataPatch } from '../sdk/types';

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

describe('PR #14 — Plugin mplay3r.scraper (Cover Art & Synced .lrc Lyrics)', () => {
  describe('Synchronized .lrc parser & binary active-line lookup', () => {
    it('parses metadata, [offset:ms], multi-timestamp chorus lines, enhanced word tags, and locates the active line', () => {
      const rawLrc = [
        '[ar:Daft Punk]',
        '[ti:Digital Love]',
        '[offset:500]',
        '[00:00.20]Intro line',
        '[00:10.50][01:05.50]Last night I had a <00:11.20>dream about you',
        '[00:25.00]In this dream I am dancing right beside you',
      ].join('\n');

      const parsed = parseLrc(rawLrc);
      assert.equal(parsed.metadata.ar, 'Daft Punk');
      assert.equal(parsed.metadata.ti, 'Digital Love');
      assert.equal(parsed.offsetSeconds, 0.5);
      // 4 timed lines sorted chronologically (offset 0.5s shifts timestamps earlier, clamped at 0)
      assert.equal(parsed.lines.length, 4);
      assert.equal(parsed.lines[0].timeSeconds, 0);
      assert.equal(parsed.lines[1].timeSeconds, 10);
      assert.equal(parsed.lines[1].text, 'Last night I had a dream about you');
      assert.equal(parsed.lines[2].timeSeconds, 24.5);
      assert.equal(parsed.lines[3].timeSeconds, 65);
      assert.equal(parsed.lines[3].text, 'Last night I had a dream about you');

      assert.equal(findActiveLrcLineIndex(parsed.lines, 5), 0);
      assert.equal(findActiveLrcLineIndex(parsed.lines, 10.1), 1);
      assert.equal(findActiveLrcLineIndex(parsed.lines, 24.6), 2);
      assert.equal(findActiveLrcLineIndex(parsed.lines, 70), 3);

      const win = getActiveLrcWindow(parsed.lines, 25);
      assert.equal(win.index, 2);
      assert.equal(win.prev?.text, 'Last night I had a dream about you');
      assert.equal(win.active?.text, 'In this dream I am dancing right beside you');
      assert.equal(win.next?.timeSeconds, 65);

      const beforeStart = getActiveLrcWindow([{ timeSeconds: 10, text: 'First' }], 2);
      assert.equal(beforeStart.index, -1);
      assert.equal(beforeStart.active, null);
      assert.equal(beforeStart.next?.text, 'First');
    });
  });

  describe('Artist / title query normalization & cache key deduplication', () => {
    it('strips noise suffixes, splits "Artist - Title" filenames, and builds identical accent-insensitive cache keys', () => {
      assert.equal(
        cleanTrackField('03 - Instant_Crush (Official Video) [Remastered 2021].flac', { stripFeaturing: true }),
        'Instant Crush',
      );

      const fromFilename = normalizeTrackQuery({
        title: '01 - Daft Punk - Instant Crush (feat. Julian Casablancas) [FLAC].mp3',
        artist: 'Unknown Artist',
      });
      assert.ok(fromFilename);
      assert.equal(fromFilename.artist, 'Daft Punk');
      assert.equal(fromFilename.title, 'Instant Crush');

      const fromTags = normalizeTrackQuery({
        artist: 'daft punk',
        title: 'Instant Crush (Official Audio)',
      });
      assert.ok(fromTags);
      assert.equal(fromFilename.cacheKey, fromTags.cacheKey);

      const accentedA = normalizeTrackQuery({ artist: 'Stromae', title: 'Formidable — Café' });
      const accentedB = normalizeTrackQuery({ artist: 'stromae', title: 'Formidable Cafe' });
      assert.equal(accentedA?.cacheKey, accentedB?.cacheKey);
      assert.equal(normalizeTrackQuery({ title: '   ' }), null);
    });
  });

  describe('Persistent cache, polite rate-limiter, HTTP 429 & offline resilience', () => {
    it('enforces per-host rate limits, caches MusicBrainz + Cover Art + LRCLIB results, and handles offline/429 cleanly', async () => {
      let fakeNow = 10_000;
      const sleptMs: number[] = [];
      const rateLimiter = new PoliteRateLimiter({
        minIntervalMs: 1100,
        now: () => fakeNow,
        sleep: async ms => {
          sleptMs.push(ms);
          fakeNow += ms;
        },
      });

      // Verify rate limiter enforces 1100ms spacing on same bucket
      assert.equal(await rateLimiter.waitForSlot('test-host'), 0);
      fakeNow += 300;
      assert.equal(await rateLimiter.waitForSlot('test-host'), 800);
      assert.deepEqual(sleptMs, [800]);

      const storage = createMemoryStorage();
      const cache = new ScraperCacheStore(storage, { maxEntries: 10, ttlMs: 60_000, now: () => fakeNow });
      let online = true;
      let force429 = false;
      let fetchCalls = 0;

      const mockFetch = async (input: string | URL): Promise<Response> => {
        fetchCalls += 1;
        const url = String(input);
        if (force429) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ 'retry-after': '2' }),
          } as unknown as Response;
        }
        if (url.startsWith('https://musicbrainz.org/ws/2/recording/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              recordings: [
                {
                  id: 'mb-rec-1',
                  score: 100,
                  title: 'Digital Love',
                  'artist-credit': [{ name: 'Daft Punk', artist: { name: 'Daft Punk', disambiguation: 'French duo' } }],
                  releases: [{ id: 'mb-rel-1', title: 'Discovery', date: '2001-03-12' }],
                  tags: [{ name: 'french house' }],
                },
              ],
            }),
          } as unknown as Response;
        }
        if (url.startsWith('https://coverartarchive.org/release/mb-rel-1')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: [
                {
                  front: true,
                  image: 'http://coverartarchive.org/release/mb-rel-1/front.jpg',
                  thumbnails: { '500': 'http://coverartarchive.org/release/mb-rel-1/front-500.jpg' },
                },
              ],
            }),
          } as unknown as Response;
        }
        if (url.startsWith('https://lrclib.net/api/get')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              syncedLyrics: '[00:05.00]Last night I had a dream about you',
              plainLyrics: 'Last night I had a dream about you',
              albumName: 'Discovery',
            }),
          } as unknown as Response;
        }
        return { ok: false, status: 404 } as unknown as Response;
      };

      const writtenTags: string[] = [];
      const service = new MetadataScraperService({
        fetcher: mockFetch,
        storage,
        cache,
        now: () => fakeNow,
        rateLimiter: new PoliteRateLimiter({ minIntervalMs: 0, now: () => fakeNow, sleep: async () => undefined }),
        isOnline: () => online,
        tagWriter: {
          async writeTags(filePath) {
            writtenTags.push(filePath);
            return true;
          },
        },
      });
      await service.load();

      const patchedTracks: Array<{ id: string; patch: TrackMetadataPatch }> = [];
      const first = await service.scrapeTrack(
        { id: 't1', artist: 'Daft Punk', title: 'Digital Love', duration: 298, filePath: '/music/digital_love.flac' },
        {
          updateTrackMetadata: async (id, patch) => {
            patchedTracks.push({ id, patch });
            return true;
          },
        },
      );

      assert.equal(first.fromCache, false);
      assert.equal(first.offline, false);
      assert.equal(first.metadata?.album, 'Discovery');
      assert.equal(first.metadata?.coverArtUrl, 'https://coverartarchive.org/release/mb-rel-1/front.jpg');
      assert.equal(first.metadata?.coverArtThumbUrl, 'https://coverartarchive.org/release/mb-rel-1/front-500.jpg');
      assert.ok(first.metadata?.syncedLyrics?.includes('[00:05.00]'));
      assert.deepEqual(first.metadata?.sources, ['MusicBrainz', 'Cover Art Archive', 'LRCLIB']);
      // Non-destructive enrichment fills missing `album` without touching existing `artist`
      assert.deepEqual(patchedTracks, [{ id: 't1', patch: { album: 'Discovery' } }]);
      assert.deepEqual(writtenTags, ['/music/digital_love.flac']);
      assert.equal(fetchCalls, 3);

      // Second lookup hits persistent cache with 0 network calls
      const second = await service.scrapeTrack({ artist: 'daft punk', title: 'Digital Love (Remastered 2021)' });
      assert.equal(second.fromCache, true);
      assert.equal(fetchCalls, 3);

      // Reload cache from storage & verify offline mode still serves cached track
      const reloadedCache = new ScraperCacheStore(storage, { maxEntries: 10, ttlMs: 60_000, now: () => fakeNow });
      await reloadedCache.load();
      assert.equal(reloadedCache.size(), 1);

      online = false;
      const offlineCached = await service.scrapeTrack({ artist: 'Daft Punk', title: 'Digital Love' });
      assert.equal(offlineCached.fromCache, true);

      const offlineMissing = await service.scrapeTrack({ artist: 'Air', title: 'Kelly Watch The Stars' });
      assert.equal(offlineMissing.metadata, null);
      assert.equal(offlineMissing.offline, true);

      // Online + HTTP 429 reports rateLimited cleanly without throwing
      online = true;
      force429 = true;
      const limited = await service.scrapeTrack({ artist: 'Air', title: 'Kelly Watch The Stars' });
      assert.equal(limited.metadata, null);
      assert.equal(limited.rateLimited, true);

      // TTL expiration drops stale entry
      fakeNow += 120_000;
      assert.ok(first.metadata);
      assert.equal(cache.get(first.metadata.cacheKey), null);
    });
  });

  describe('Plugin activation & clean teardown', () => {
    it('registers track-info and panel slots and cleanly handles deactivate()', async () => {
      const slots: PluginSlotDescriptor[] = [];
      const mockCtx = {
        manifest: scraperPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        getState: () => ({ currentTrack: null, currentTime: 0 }),
        updateTrackMetadata: async () => true,
        on: () => () => undefined,
        registerSlot: (slot: PluginSlotDescriptor) => {
          slots.push(slot);
          return () => undefined;
        },
        fetch: async () => ({ ok: false, status: 404 }) as unknown as Response,
      } as unknown as PluginContext;

      await scraperPlugin.activate(mockCtx);
      assert.deepEqual(
        slots.map(s => s.slot).sort(),
        ['panel', 'track-info'],
      );
      await scraperPlugin.deactivate?.();
    });
  });
});
