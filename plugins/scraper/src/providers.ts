import type { PluginStorage, TrackMetadataPatch } from '../../../sdk/types';
import { normalizeTrackQuery } from './normalize';
import type { NormalizedTrackQuery, TrackQueryInput } from './normalize';

export type ScraperFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ScrapedTrackMetadata {
  cacheKey: string;
  artist: string;
  title: string;
  album?: string;
  releaseDate?: string;
  mbid?: string;
  releaseMbid?: string;
  coverArtUrl?: string;
  coverArtThumbUrl?: string;
  syncedLyrics?: string;
  plainLyrics?: string;
  bio?: string;
  fetchedAt: string;
  sources: string[];
}

export interface ScraperSettings {
  autoScrape: boolean;
  fetchCoverArt: boolean;
  fetchLyrics: boolean;
  enrichTrackTags: boolean;
}

export interface ScrapeOutcome {
  metadata: ScrapedTrackMetadata | null;
  fromCache: boolean;
  offline: boolean;
  rateLimited: boolean;
  error?: string;
}

export interface DesktopTagWriter {
  writeTags(filePath: string, metadata: ScrapedTrackMetadata): Promise<boolean>;
}

const SCRAPER_CACHE_KEY = 'scraperMetadataCache';
const SCRAPER_SETTINGS_KEY = 'scraperSettings';
const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const COVER_ART_BASE = 'https://coverartarchive.org';
const LRCLIB_BASE = 'https://lrclib.net/api';
const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 200;

export const DEFAULT_SCRAPER_SETTINGS: Readonly<ScraperSettings> = {
  autoScrape: true,
  fetchCoverArt: true,
  fetchLyrics: true,
  enrichTrackTags: true,
};

function isSafeHttpsUrl(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\/\S+/i.test(url.trim()));
}

function upgradeToHttps(url: string): string {
  return url.trim().replace(/^http:\/\//i, 'https://');
}

/**
 * Per-host polite rate limiter (MusicBrainz requires <= 1 request/sec) with Retry-After support.
 * Accepts injectable `now` and `sleep` functions for instant deterministic tests.
 */
export class PoliteRateLimiter {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly nextAllowedAt = new Map<string, number>();

  constructor(options: {
    minIntervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {}) {
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 1100);
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async waitForSlot(bucket: string): Promise<number> {
    const current = this.now();
    const allowedAt = this.nextAllowedAt.get(bucket) ?? current;
    const waitMs = Math.max(0, allowedAt - current);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    this.nextAllowedAt.set(bucket, this.now() + this.minIntervalMs);
    return waitMs;
  }

  applyBackoff(bucket: string, retryAfterMs: number): void {
    const delay = Math.max(this.minIntervalMs, Math.min(60_000, retryAfterMs));
    this.nextAllowedAt.set(bucket, this.now() + delay);
  }
}

/** Persistent LRU + TTL metadata cache backed by `ctx.storage`. */
export class ScraperCacheStore {
  private readonly storage: PluginStorage;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private entries = new Map<string, ScrapedTrackMetadata>();

  constructor(
    storage: PluginStorage,
    options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
  ) {
    this.storage = storage;
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxEntries = Math.max(10, options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES);
    this.now = options.now ?? (() => Date.now());
  }

  async load(): Promise<number> {
    const saved = await this.storage.get<ScrapedTrackMetadata[]>(SCRAPER_CACHE_KEY);
    this.entries.clear();
    if (Array.isArray(saved)) {
      for (const item of saved) {
        if (item && typeof item.cacheKey === 'string' && !this.isExpired(item)) {
          this.entries.set(item.cacheKey, item);
        }
      }
    }
    return this.entries.size;
  }

  private isExpired(entry: ScrapedTrackMetadata): boolean {
    const ts = Date.parse(entry.fetchedAt);
    if (!Number.isFinite(ts)) return false;
    return this.now() - ts > this.ttlMs;
  }

  get(cacheKey: string): ScrapedTrackMetadata | null {
    const found = this.entries.get(cacheKey);
    if (!found) return null;
    if (this.isExpired(found)) {
      this.entries.delete(cacheKey);
      return null;
    }
    return { ...found, sources: [...found.sources] };
  }

  size(): number {
    return this.entries.size;
  }

  async set(entry: ScrapedTrackMetadata): Promise<void> {
    this.entries.delete(entry.cacheKey);
    this.entries.set(entry.cacheKey, entry);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    await this.storage.set(SCRAPER_CACHE_KEY, Array.from(this.entries.values()));
  }

  async clear(): Promise<void> {
    this.entries.clear();
    await this.storage.remove(SCRAPER_CACHE_KEY);
  }
}

interface MusicBrainzRecordingRaw {
  id?: string;
  score?: number;
  title?: string;
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string; disambiguation?: string } }>;
  releases?: Array<{ id?: string; title?: string; date?: string; 'release-group'?: { id?: string } }>;
  tags?: Array<{ name?: string; count?: number }>;
}

interface CoverArtArchiveResponse {
  images?: Array<{
    front?: boolean;
    image?: string;
    thumbnails?: { large?: string; small?: string; '500'?: string; '250'?: string };
  }>;
}

interface LrclibRecordRaw {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  albumName?: string | null;
  artistName?: string | null;
  trackName?: string | null;
}

function escapeLuceneTerm(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function parseRetryAfterMs(res: Response): number {
  const raw = res.headers?.get?.('retry-after');
  if (!raw) return 5000;
  const secs = Number.parseInt(raw, 10);
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : 5000;
}

/** Queries MusicBrainz recording search + Cover Art Archive front cover image. */
export async function fetchMusicBrainzAndCoverArt(
  query: NormalizedTrackQuery,
  fetcher: ScraperFetcher,
  rateLimiter: PoliteRateLimiter,
  options: { fetchCoverArt?: boolean } = {},
): Promise<{
  partial: Partial<ScrapedTrackMetadata>;
  sources: string[];
  rateLimited: boolean;
}> {
  const parts: string[] = [`recording:"${escapeLuceneTerm(query.title)}"`];
  if (query.artist) parts.push(`artist:"${escapeLuceneTerm(query.artist)}"`);
  if (query.album) parts.push(`release:"${escapeLuceneTerm(query.album)}"`);

  const params = new URLSearchParams({
    query: parts.join(' AND '),
    fmt: 'json',
    limit: '3',
  });

  await rateLimiter.waitForSlot('musicbrainz');
  const res = await fetcher(`${MUSICBRAINZ_BASE}/recording/?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (res.status === 429 || res.status === 503) {
    rateLimiter.applyBackoff('musicbrainz', parseRetryAfterMs(res));
    return { partial: {}, sources: [], rateLimited: true };
  }
  if (!res.ok) {
    return { partial: {}, sources: [], rateLimited: false };
  }

  const data = (await res.json()) as { recordings?: MusicBrainzRecordingRaw[] };
  const top = Array.isArray(data.recordings) ? data.recordings[0] : undefined;
  if (!top) {
    return { partial: {}, sources: [], rateLimited: false };
  }

  const credit = top['artist-credit']?.[0];
  const release = top.releases?.[0];
  const tags = (top.tags ?? [])
    .slice(0, 4)
    .map(t => t.name)
    .filter((n): n is string => Boolean(n));
  const bioParts = [credit?.artist?.disambiguation, tags.length > 0 ? `Tags: ${tags.join(', ')}` : ''].filter(Boolean);

  const partial: Partial<ScrapedTrackMetadata> = {
    mbid: top.id,
    title: top.title || query.title,
    artist: credit?.name || credit?.artist?.name || query.artist,
    album: release?.title || query.album,
    releaseDate: release?.date,
    releaseMbid: release?.id,
    bio: bioParts.length > 0 ? bioParts.join(' · ') : undefined,
  };
  const sources = ['MusicBrainz'];

  if (options.fetchCoverArt !== false && release?.id) {
    try {
      await rateLimiter.waitForSlot('coverartarchive');
      const caRes = await fetcher(`${COVER_ART_BASE}/release/${encodeURIComponent(release.id)}`, {
        headers: { Accept: 'application/json' },
      });
      if (caRes.ok) {
        const caJson = (await caRes.json()) as CoverArtArchiveResponse;
        const front = caJson.images?.find(img => img.front) ?? caJson.images?.[0];
        if (front && isSafeHttpsUrl(front.image)) {
          partial.coverArtUrl = upgradeToHttps(front.image);
          const thumb = front.thumbnails?.['500'] || front.thumbnails?.large || front.thumbnails?.['250'] || front.image;
          partial.coverArtThumbUrl = isSafeHttpsUrl(thumb) ? upgradeToHttps(thumb) : partial.coverArtUrl;
          sources.push('Cover Art Archive');
        }
      }
    } catch {
      // Missing cover art is non-fatal; preserve MusicBrainz metadata.
    }
  }

  return { partial, sources, rateLimited: false };
}

/** Queries open CORS-friendly LRCLIB API for synced `.lrc` (and fallback plain) lyrics. */
export async function fetchLrclibLyrics(
  query: NormalizedTrackQuery,
  fetcher: ScraperFetcher,
  rateLimiter: PoliteRateLimiter,
): Promise<{
  syncedLyrics?: string;
  plainLyrics?: string;
  album?: string;
  found: boolean;
  rateLimited: boolean;
}> {
  await rateLimiter.waitForSlot('lrclib');

  if (query.artist) {
    const params = new URLSearchParams({
      track_name: query.title,
      artist_name: query.artist,
    });
    if (query.album) params.set('album_name', query.album);
    if (query.duration) params.set('duration', String(query.duration));

    const exactRes = await fetcher(`${LRCLIB_BASE}/get?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (exactRes.status === 429 || exactRes.status === 503) {
      rateLimiter.applyBackoff('lrclib', parseRetryAfterMs(exactRes));
      return { found: false, rateLimited: true };
    }
    if (exactRes.ok) {
      const rec = (await exactRes.json()) as LrclibRecordRaw;
      if (rec.syncedLyrics || rec.plainLyrics) {
        return {
          syncedLyrics: rec.syncedLyrics || undefined,
          plainLyrics: rec.plainLyrics || undefined,
          album: rec.albumName || undefined,
          found: true,
          rateLimited: false,
        };
      }
    }
  }

  // Fallback to LRCLIB search endpoint when exact match returns 404 or artist was unknown.
  const searchParams = new URLSearchParams({
    q: [query.artist, query.title].filter(Boolean).join(' '),
  });
  await rateLimiter.waitForSlot('lrclib');
  const searchRes = await fetcher(`${LRCLIB_BASE}/search?${searchParams.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (searchRes.status === 429 || searchRes.status === 503) {
    rateLimiter.applyBackoff('lrclib', parseRetryAfterMs(searchRes));
    return { found: false, rateLimited: true };
  }
  if (!searchRes.ok) {
    return { found: false, rateLimited: false };
  }
  const items = (await searchRes.json()) as LrclibRecordRaw[];
  const best = Array.isArray(items)
    ? items.find(r => Boolean(r.syncedLyrics)) ?? items.find(r => Boolean(r.plainLyrics))
    : undefined;

  if (!best) {
    return { found: false, rateLimited: false };
  }
  return {
    syncedLyrics: best.syncedLyrics || undefined,
    plainLyrics: best.plainLyrics || undefined,
    album: best.albumName || undefined,
    found: true,
    rateLimited: false,
  };
}

/**
 * Coordinates 100% opt-in scraping, persistent caching, polite rate limiting,
 * offline resilience, optional track tag enrichment, and optional Desktop tag writing.
 */
export class MetadataScraperService {
  private readonly fetcher: ScraperFetcher;
  private readonly storage: PluginStorage;
  private readonly cache: ScraperCacheStore;
  private readonly rateLimiter: PoliteRateLimiter;
  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly tagWriter?: DesktopTagWriter;
  private settings: ScraperSettings = { ...DEFAULT_SCRAPER_SETTINGS };

  constructor(options: {
    fetcher: ScraperFetcher;
    storage: PluginStorage;
    cache?: ScraperCacheStore;
    rateLimiter?: PoliteRateLimiter;
    isOnline?: () => boolean;
    now?: () => number;
    tagWriter?: DesktopTagWriter;
  }) {
    this.fetcher = options.fetcher;
    this.storage = options.storage;
    this.now = options.now ?? (() => Date.now());
    this.cache = options.cache ?? new ScraperCacheStore(options.storage, { now: this.now });
    this.rateLimiter = options.rateLimiter ?? new PoliteRateLimiter({ now: this.now });
    this.isOnline =
      options.isOnline ??
      (() => (typeof navigator === 'undefined' || navigator.onLine !== false));
    this.tagWriter = options.tagWriter;
  }

  async load(): Promise<void> {
    await this.cache.load();
    const saved = await this.storage.get<Partial<ScraperSettings>>(SCRAPER_SETTINGS_KEY);
    if (saved && typeof saved === 'object') {
      this.settings = {
        autoScrape: typeof saved.autoScrape === 'boolean' ? saved.autoScrape : DEFAULT_SCRAPER_SETTINGS.autoScrape,
        fetchCoverArt:
          typeof saved.fetchCoverArt === 'boolean' ? saved.fetchCoverArt : DEFAULT_SCRAPER_SETTINGS.fetchCoverArt,
        fetchLyrics: typeof saved.fetchLyrics === 'boolean' ? saved.fetchLyrics : DEFAULT_SCRAPER_SETTINGS.fetchLyrics,
        enrichTrackTags:
          typeof saved.enrichTrackTags === 'boolean' ? saved.enrichTrackTags : DEFAULT_SCRAPER_SETTINGS.enrichTrackTags,
      };
    }
  }

  getSettings(): ScraperSettings {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<ScraperSettings>): Promise<ScraperSettings> {
    this.settings = { ...this.settings, ...patch };
    await this.storage.set(SCRAPER_SETTINGS_KEY, this.settings);
    return this.getSettings();
  }

  getCacheSize(): number {
    return this.cache.size();
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /** Scrapes metadata for a track with cache-first lookup, offline resilience, and polite rate limiting. */
  async scrapeTrack(
    track: TrackQueryInput & { id?: string; filePath?: string },
    options: {
      forceRefresh?: boolean;
      updateTrackMetadata?: (trackId: string, patch: TrackMetadataPatch) => Promise<boolean>;
    } = {},
  ): Promise<ScrapeOutcome> {
    const query = normalizeTrackQuery(track);
    if (!query) {
      return { metadata: null, fromCache: false, offline: false, rateLimited: false };
    }

    if (!options.forceRefresh) {
      const cached = this.cache.get(query.cacheKey);
      if (cached) {
        return { metadata: cached, fromCache: true, offline: false, rateLimited: false };
      }
    }

    if (!this.isOnline()) {
      const staleCached = this.cache.get(query.cacheKey);
      return {
        metadata: staleCached,
        fromCache: staleCached !== null,
        offline: true,
        rateLimited: false,
      };
    }

    const sources: string[] = [];
    let rateLimited = false;
    let mbPartial: Partial<ScrapedTrackMetadata> = {};
    let lyricsResult: { syncedLyrics?: string; plainLyrics?: string; album?: string; found: boolean; rateLimited: boolean } = {
      found: false,
      rateLimited: false,
    };
    let networkErrorCount = 0;

    if (this.settings.fetchCoverArt) {
      try {
        const mb = await fetchMusicBrainzAndCoverArt(query, this.fetcher, this.rateLimiter, {
          fetchCoverArt: true,
        });
        mbPartial = mb.partial;
        sources.push(...mb.sources);
        if (mb.rateLimited) rateLimited = true;
      } catch {
        networkErrorCount += 1;
      }
    }

    if (this.settings.fetchLyrics) {
      try {
        lyricsResult = await fetchLrclibLyrics(query, this.fetcher, this.rateLimiter);
        if (lyricsResult.found) sources.push('LRCLIB');
        if (lyricsResult.rateLimited) rateLimited = true;
      } catch {
        networkErrorCount += 1;
      }
    }

    const totalAttempted = (this.settings.fetchCoverArt ? 1 : 0) + (this.settings.fetchLyrics ? 1 : 0);
    if (sources.length === 0) {
      return {
        metadata: null,
        fromCache: false,
        offline: totalAttempted > 0 && networkErrorCount >= totalAttempted,
        rateLimited,
      };
    }

    const metadata: ScrapedTrackMetadata = {
      cacheKey: query.cacheKey,
      artist: mbPartial.artist || query.artist,
      title: mbPartial.title || query.title,
      album: mbPartial.album || lyricsResult.album || query.album,
      releaseDate: mbPartial.releaseDate,
      mbid: mbPartial.mbid,
      releaseMbid: mbPartial.releaseMbid,
      coverArtUrl: mbPartial.coverArtUrl,
      coverArtThumbUrl: mbPartial.coverArtThumbUrl,
      syncedLyrics: lyricsResult.syncedLyrics,
      plainLyrics: lyricsResult.plainLyrics,
      bio: mbPartial.bio,
      fetchedAt: new Date(this.now()).toISOString(),
      sources,
    };

    await this.cache.set(metadata);

    // Enrich missing track tags non-destructively inside mPlay3r playlist.
    if (this.settings.enrichTrackTags && track.id && options.updateTrackMetadata) {
      const patch: TrackMetadataPatch = {};
      if (!track.artist && metadata.artist) patch.artist = metadata.artist;
      if (!track.album && metadata.album) patch.album = metadata.album;
      if (Object.keys(patch).length > 0) {
        await options.updateTrackMetadata(track.id, patch).catch(() => false);
      }
    }

    if (this.tagWriter && track.filePath) {
      await this.tagWriter.writeTags(track.filePath, metadata).catch(() => false);
    }

    return { metadata, fromCache: false, offline: false, rateLimited };
  }
}
