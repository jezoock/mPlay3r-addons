import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPodcastMediaSourceProvider,
  detectStreamingPlatform,
  extractAlternateFeedUrls,
  resolvePlatformUrlToFeed,
  searchPodcastIndex,
} from '../plugins/podcasts/src/directory';
import podcastsPlugin from '../plugins/podcasts/src/index';
import {
  decodePodcastFeedBytes,
  extractInlineChapters,
  findActiveChapter,
  formatPodcastTime,
  parsePodcastDuration,
  parsePodcastFeed,
} from '../plugins/podcasts/src/rss';
import type { PodcastEpisode } from '../plugins/podcasts/src/rss';
import {
  clampPlaybackRate,
  computeSkipTarget,
  makeEpisodeKey,
  nextPlaybackRate,
  OfflineEpisodeManager,
  PodcastPlaybackController,
  PodcastStateStore,
} from '../plugins/podcasts/src/state';
import type { OfflineCacheLike } from '../plugins/podcasts/src/state';
import type { MediaSourceProvider, PluginContext, PluginSlotDescriptor, PluginStorage } from '../sdk/types';

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

describe('PR #10 — Plugin mplay3r.podcasts (Podcasts & Streaming Sources)', () => {
  describe('RSS 2.0 / Atom / iTunes feed parser & encodings', () => {
    it('parses RSS 2.0 + iTunes durations, CDATA, entities, Podlove & inline chapters, and tolerates incomplete items', () => {
      const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:psc="http://podlove.org/simple-chapters">
  <channel>
    <title><![CDATA[Tech &amp; Audio Café]]></title>
    <itunes:author>Alice &amp; Bob</itunes:author>
    <description>&lt;p&gt;Weekly audio engineering.&lt;/p&gt;</description>
    <itunes:image href="https://cdn.example/cover.jpg" />
    <itunes:category text="Technology" />
    <link>https://example.org/show</link>
    <item>
      <guid>ep-001</guid>
      <title>Episode 1 &#8212; DSP Basics</title>
      <enclosure url="https://cdn.example/ep1.mp3" type="audio/mpeg" length="12345678" />
      <itunes:duration>01:02:03</itunes:duration>
      <itunes:season>2</itunes:season>
      <itunes:episode>14</itunes:episode>
      <pubDate>Tue, 10 Nov 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[<p>Deep dive into <b>filters</b>.<br/>Thanks for listening!</p>]]></description>
      <psc:chapters>
        <psc:chapter start="00:00:00" title="Intro" />
        <psc:chapter start="00:15:30" title="Biquad Filters" />
        <psc:chapter start="00:45:00" title="Q&amp;A" />
      </psc:chapters>
    </item>
    <item>
      <guid>ep-002</guid>
      <title>Episode 2 — Inline Chapters</title>
      <enclosure url="https://cdn.example/ep2.m4a" type="audio/mp4" />
      <itunes:duration>45:10</itunes:duration>
      <description>
        00:00 Welcome
        12:30 - Web Audio Graph
        31:00 Wrap up
      </description>
    </item>
    <item>
      <guid>ep-003</guid>
      <title>Raw Seconds Duration</title>
      <enclosure url="https://cdn.example/ep3.ogg" type="audio/ogg" />
      <itunes:duration>195</itunes:duration>
    </item>
    <item>
      <title>Unsafe Enclosure Should Be Skipped</title>
      <enclosure url="javascript:alert(1)" type="audio/mpeg" />
    </item>
    <item>
      <title>Text-only Announcement Without Audio</title>
      <description>No enclosure here</description>
    </item>
    <item>
      <title>Truncated trailing item without closing tag
  </channel>
</rss>`;

      const feed = parsePodcastFeed(rssXml, 'https://example.org/feed.xml');
      assert.equal(feed.title, 'Tech & Audio Café');
      assert.equal(feed.author, 'Alice & Bob');
      assert.equal(feed.artworkUrl, 'https://cdn.example/cover.jpg');
      assert.deepEqual(feed.categories, ['Technology']);
      assert.equal(feed.episodes.length, 3);

      const [ep1, ep2, ep3] = feed.episodes;
      assert.equal(ep1.id, 'ep-001');
      assert.equal(ep1.title, 'Episode 1 — DSP Basics');
      assert.equal(ep1.duration, 3723);
      assert.equal(ep1.seasonNumber, 2);
      assert.equal(ep1.episodeNumber, 14);
      assert.equal(ep1.byteLength, 12345678);
      assert.equal(ep1.chapters.length, 3);
      assert.equal(ep1.chapters[1].title, 'Biquad Filters');
      assert.equal(ep1.chapters[1].startSeconds, 930);
      assert.equal(ep1.chapters[2].title, 'Q&A');
      assert.equal(findActiveChapter(ep1.chapters, 1000)?.title, 'Biquad Filters');
      assert.equal(findActiveChapter(ep1.chapters, 3000)?.title, 'Q&A');

      assert.equal(ep2.duration, 2710);
      assert.equal(ep2.chapters.length, 3);
      assert.equal(ep2.chapters[1].title, 'Web Audio Graph');
      assert.equal(ep2.chapters[1].startSeconds, 750);

      assert.equal(ep3.duration, 195);

      assert.equal(parsePodcastDuration('1h 5m 10s'), 3910);
      assert.equal(parsePodcastDuration('00:00:00'), undefined);
      assert.equal(parsePodcastDuration('not-a-duration'), undefined);
      assert.equal(formatPodcastTime(3723), '1:02:03');
      assert.equal(formatPodcastTime(75), '1:15');
      assert.equal(extractInlineChapters('Just one line without timestamps').length, 0);
    });

    it('parses Atom podcast feeds with link rel="enclosure"', () => {
      const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <title>Atom Radio Journal</title>
  <author><name>Clara</name></author>
  <subtitle>Daily audio dispatches</subtitle>
  <link rel="alternate" href="https://atom.example/podcast" />
  <logo>https://atom.example/logo.png</logo>
  <entry>
    <id>tag:atom.example,2026:ep1</id>
    <title>Morning Dispatch</title>
    <published>2026-11-20T07:30:00Z</published>
    <summary>Headlines &amp; interviews.</summary>
    <itunes:duration>18:45</itunes:duration>
    <link rel="enclosure" href="https://atom.example/ep1.mp3" type="audio/mpeg" length="5000000" />
  </entry>
</feed>`;

      const feed = parsePodcastFeed(atomXml, 'https://atom.example/feed.atom');
      assert.equal(feed.title, 'Atom Radio Journal');
      assert.equal(feed.author, 'Clara');
      assert.equal(feed.artworkUrl, 'https://atom.example/logo.png');
      assert.equal(feed.episodes.length, 1);
      assert.equal(feed.episodes[0].audioUrl, 'https://atom.example/ep1.mp3');
      assert.equal(feed.episodes[0].duration, 1125);
      assert.equal(feed.episodes[0].publishedAt, '2026-11-20T07:30:00.000Z');
    });

    it('decodes ISO-8859-1 XML feeds from XML declaration or HTTP Content-Type and falls back cleanly on unknown charsets', () => {
      // "Caf\xe9" in ISO-8859-1 (Latin-1)
      const latin1Header = '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Caf';
      const latin1Tail = '</title></channel></rss>';
      const bytes = new Uint8Array(latin1Header.length + 1 + latin1Tail.length);
      for (let i = 0; i < latin1Header.length; i += 1) bytes[i] = latin1Header.charCodeAt(i);
      bytes[latin1Header.length] = 0xe9; // 'é' in ISO-8859-1
      for (let i = 0; i < latin1Tail.length; i += 1) bytes[latin1Header.length + 1 + i] = latin1Tail.charCodeAt(i);

      const decoded = decodePodcastFeedBytes(bytes);
      assert.ok(decoded.includes('<title>Café</title>'));

      const decodedViaHeader = decodePodcastFeedBytes(
        new Uint8Array([0x43, 0x61, 0x66, 0xe9]),
        'application/xml; charset=ISO-8859-1',
      );
      assert.equal(decodedViaHeader, 'Café');

      const fallbackUtf8 = decodePodcastFeedBytes(
        new TextEncoder().encode('Podcast écouté'),
        'application/xml; charset=x-nonexistent-charset',
      );
      assert.equal(fallbackUtf8, 'Podcast écouté');
    });
  });

  describe('Streaming platform URL resolver & directory search', () => {
    it('resolves Apple Podcasts, Spotify, HTML RSS autodiscovery, and direct RSS links', async () => {
      assert.equal(detectStreamingPlatform('https://podcasts.apple.com/fr/podcast/tech-talk/id987654321').platform, 'apple');
      assert.equal(detectStreamingPlatform('https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk').platform, 'spotify');
      assert.equal(detectStreamingPlatform('https://example.org/podcasts/feed.xml').platform, 'rss');

      const mockFetch = async (input: string | URL): Promise<Response> => {
        const url = String(input);
        if (url.startsWith('https://itunes.apple.com/lookup?id=987654321')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  collectionId: 987654321,
                  collectionName: 'Tech Talk',
                  artistName: 'Studio Open',
                  feedUrl: 'https://feeds.example/tech-talk.xml',
                },
              ],
            }),
          } as unknown as Response;
        }
        if (url.startsWith('https://open.spotify.com/oembed')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ title: 'Syntax FM', provider_name: 'Spotify' }),
          } as unknown as Response;
        }
        if (url.startsWith('https://itunes.apple.com/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  collectionId: 555,
                  collectionName: 'Syntax FM',
                  artistName: 'Wes & Scott',
                  feedUrl: 'https://feed.syntax.fm/rss',
                  primaryGenreName: 'Technology',
                },
              ],
            }),
          } as unknown as Response;
        }
        if (url === 'https://indie.example/podcast') {
          const html = `<!doctype html><html><head>
            <title>Indie Show | Podcast</title>
            <link rel="alternate" type="application/rss+xml" href="/audio/rss.xml" />
          </head></html>`;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
            arrayBuffer: async () => new TextEncoder().encode(html).buffer,
          } as unknown as Response;
        }
        return { ok: false, status: 404 } as unknown as Response;
      };

      const apple = await resolvePlatformUrlToFeed(
        'https://podcasts.apple.com/fr/podcast/tech-talk/id987654321',
        mockFetch,
      );
      assert.equal(apple?.kind, 'platform-resolved');
      assert.equal(apple?.platform, 'apple');
      assert.equal(apple?.feedUrl, 'https://feeds.example/tech-talk.xml');

      const spotify = await resolvePlatformUrlToFeed(
        'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
        mockFetch,
      );
      assert.equal(spotify?.kind, 'platform-resolved');
      assert.equal(spotify?.platform, 'spotify');
      assert.equal(spotify?.feedUrl, 'https://feed.syntax.fm/rss');

      const htmlPage = await resolvePlatformUrlToFeed('https://indie.example/podcast', mockFetch);
      assert.equal(htmlPage?.kind, 'html-autodiscovery');
      assert.equal(htmlPage?.feedUrl, 'https://indie.example/audio/rss.xml');
      assert.equal(htmlPage?.title, 'Indie Show');

      const direct = await resolvePlatformUrlToFeed('https://feeds.example/direct.rss', mockFetch);
      assert.equal(direct?.kind, 'feed');
      assert.equal(direct?.feedUrl, 'https://feeds.example/direct.rss');

      assert.equal(await resolvePlatformUrlToFeed('javascript:alert(1)', mockFetch), null);
      assert.deepEqual(
        extractAlternateFeedUrls('<link rel="alternate" type="application/atom+xml" href="feed.atom">', 'https://a.test/dir/'),
        ['https://a.test/dir/feed.atom'],
      );
    });

    it('supports Podcast Index search and MediaSourceProvider search + resolveUrl', async () => {
      const piResults = await searchPodcastIndex(
        'rust',
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              feeds: [
                {
                  id: 42,
                  title: 'Rustacean Station',
                  author: 'Rust Community',
                  url: 'https://rustacean-station.org/podcast.rss',
                  categories: { '1': 'Technology' },
                  episodeCount: 120,
                },
                { id: 99, title: 'Bad Feed', url: 'ftp://unsafe.example/feed' },
              ],
            }),
          }) as unknown as Response,
        { endpoint: 'https://podcastindex.example/api/1.0/search/byterm' },
      );

      assert.equal(piResults.length, 1);
      assert.equal(piResults[0].title, 'Rustacean Station');
      assert.equal(piResults[0].genre, 'Technology');

      const provider = createPodcastMediaSourceProvider(async url => {
        if (String(url).includes('itunes.apple.com/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  collectionId: 101,
                  collectionName: 'Open Audio',
                  artistName: 'Hosts',
                  feedUrl: 'https://open.example/feed.xml',
                },
              ],
            }),
          } as unknown as Response;
        }
        const rss = `<rss><channel><title>Open Audio</title><item><guid>e1</guid><title>Pilot</title><enclosure url="https://open.example/e1.mp3" type="audio/mpeg" /><itunes:duration>10:00</itunes:duration></item></channel></rss>`;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/rss+xml' }),
          arrayBuffer: async () => new TextEncoder().encode(rss).buffer,
        } as unknown as Response;
      });

      const found = await provider.search('Open Audio');
      assert.equal(found.length, 1);
      assert.equal(found[0].streamUrl, 'https://open.example/feed.xml');

      assert.ok(provider.resolveUrl);
      const episodes = await provider.resolveUrl('https://open.example/feed.xml');
      assert.equal(episodes.length, 1);
      assert.equal(episodes[0].streamUrl, 'https://open.example/e1.mp3');
      assert.equal(episodes[0].duration, 600);
    });
  });

  describe('Subscriptions, resume position, playback speed (0.75x-2x) & skips (-15s/+30s)', () => {
    it('tracks subscriptions, auto-resumes mid-episode, marks completed at end, and controls speed & skips', async () => {
      const storage = createMemoryStorage();
      const store = new PodcastStateStore(storage);
      await store.load();

      await store.subscribe({
        feedUrl: 'https://feeds.example/show.xml',
        title: 'Show One',
        author: 'Host',
      });
      assert.equal(store.isSubscribed('https://feeds.example/show.xml'), true);

      const episode: PodcastEpisode = {
        id: 'ep-42',
        feedUrl: 'https://feeds.example/show.xml',
        showTitle: 'Show One',
        title: 'Episode 42',
        audioUrl: 'https://cdn.example/ep42.mp3',
        duration: 1800,
        chapters: [
          { startSeconds: 0, title: 'Start' },
          { startSeconds: 600, title: 'Main Topic' },
        ],
      };
      const epKey = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);

      // Under 5s should not trigger resume.
      await store.saveProgress(epKey, 3, 1800, { force: true });
      assert.equal(store.getResumePosition(epKey), 0);

      // Mid-episode persists and resumes cleanly across reloads.
      await store.saveProgress(epKey, 615, 1800, { force: true });
      const reloaded = new PodcastStateStore(storage);
      await reloaded.load();
      assert.equal(reloaded.isSubscribed('https://feeds.example/show.xml'), true);
      assert.equal(reloaded.getResumePosition(epKey), 615);

      // Playback rate clamping & cycling
      assert.equal(clampPlaybackRate(0.2), 0.75);
      assert.equal(clampPlaybackRate(4.5), 2);
      assert.equal(clampPlaybackRate(Number.NaN), 1);
      assert.equal(nextPlaybackRate(1), 1.25);
      assert.equal(nextPlaybackRate(2), 0.75);

      // Controller auto-resume, speed application, and -15s / +30s skips
      let currentTime = 0;
      let appliedRate = 1;
      const seeks: number[] = [];
      const controller = new PodcastPlaybackController(reloaded, {
        seek: async sec => {
          seeks.push(sec);
          currentTime = sec;
        },
        getCurrentTime: () => currentTime,
        getDuration: () => 1800,
        applyPlaybackRate: r => {
          appliedRate = r;
        },
      });
      controller.registerEpisode(episode);

      await controller.setRate(1.5);
      const changed = await controller.onTrackChanged({ id: 't1', src: episode.audioUrl });
      assert.equal(changed.resumeAt, 615);
      assert.equal(changed.playbackRate, 1.5);
      assert.equal(appliedRate, 1.5);
      assert.deepEqual(seeks, [615]);
      assert.equal(controller.getState().activeChapter?.title, 'Main Topic');

      // Skip forward +30s and backward -15s
      assert.equal(await controller.skipForward(30), 645);
      assert.equal(await controller.skipBackward(15), 630);
      assert.equal(computeSkipTarget(10, 1800, -15), 0);
      assert.equal(computeSkipTarget(1790, 1800, 30), 1800);
      assert.equal(computeSkipTarget(40, 0, 30), 70);

      // Cycling playback rate persists
      assert.equal(await controller.cycleRate(), 1.75);
      assert.equal(appliedRate, 1.75);

      // Reaching >= 95% marks episode completed and resets resume position to 0
      await controller.onTimeUpdate(1790, 1800);
      assert.equal(reloaded.getProgress(epKey)?.completed, true);
      assert.equal(reloaded.getResumePosition(epKey), 0);
    });
  });

  describe('Offline episode download & cache lifecycle', () => {
    it('downloads audio bytes into cache, serves a blob: URL offline, and revokes cleanly on delete', async () => {
      const storage = createMemoryStorage();
      const store = new PodcastStateStore(storage);
      await store.load();

      const cacheMap = new Map<string, Response>();
      const mockCache: OfflineCacheLike = {
        async put(req, res) {
          cacheMap.set(req, res);
        },
        async match(req) {
          return cacheMap.get(req);
        },
        async delete(req) {
          return cacheMap.delete(req);
        },
      };

      const offline = new OfflineEpisodeManager(store, async () => mockCache);
      const episode: PodcastEpisode = {
        id: 'ep-off',
        feedUrl: 'https://feeds.example/show.xml',
        showTitle: 'Offline Show',
        title: 'Offline Episode',
        audioUrl: 'https://cdn.example/offline.mp3',
        mimeType: 'audio/mpeg',
        chapters: [],
      };

      const payload = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const rec = await offline.downloadEpisode(episode, async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'audio/mpeg' }),
          arrayBuffer: async () => payload.buffer,
        } as unknown as Response;
      });

      assert.equal(rec.sizeBytes, payload.byteLength);
      assert.equal(store.isOffline(rec.episodeKey), true);

      const resolved = await offline.resolvePlayableUrl(episode);
      assert.equal(resolved.offline, true);
      assert.ok(resolved.url.startsWith('blob:'));

      assert.equal(await offline.removeDownload(rec.episodeKey), true);
      assert.equal(store.isOffline(rec.episodeKey), false);
      assert.equal(cacheMap.size, 0);

      const afterDelete = await offline.resolvePlayableUrl(episode);
      assert.equal(afterDelete.offline, false);
      assert.equal(afterDelete.url, episode.audioUrl);

      offline.dispose();
    });
  });

  describe('Plugin activation & extensible MediaSourceProvider discovery', () => {
    it('registers mplay3r-podcasts provider, panel + track-info slots, and discovers third-party MediaSourceProviders', async () => {
      const providers: MediaSourceProvider[] = [
        {
          id: 'navidrome-subsonic',
          name: 'Navidrome (Subsonic)',
          async search() {
            return [];
          },
        },
      ];
      const slots: PluginSlotDescriptor[] = [];

      const mockCtx = {
        manifest: podcastsPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        getState: () => ({ currentTime: 0, duration: 0 }),
        playback: {
          seek: async () => undefined,
        },
        playlist: {
          clearPlaylist: async () => undefined,
          addTracks: async () => [],
        },
        on: () => () => undefined,
        registerProvider: (_kind: 'media-source', provider: MediaSourceProvider) => {
          providers.push(provider);
          return () => undefined;
        },
        getProviders: () => providers,
        registerSlot: (slot: PluginSlotDescriptor) => {
          slots.push(slot);
          return () => undefined;
        },
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }) as unknown as Response,
        notify: async () => undefined,
      } as unknown as PluginContext;

      await podcastsPlugin.activate(mockCtx);
      assert.equal(providers.length, 2);
      assert.ok(providers.some(p => p.id === 'mplay3r-podcasts'));
      assert.ok(providers.some(p => p.id === 'navidrome-subsonic'));
      assert.deepEqual(
        slots.map(s => s.slot).sort(),
        ['panel', 'track-info'],
      );
      await podcastsPlugin.deactivate?.();
    });
  });
});
