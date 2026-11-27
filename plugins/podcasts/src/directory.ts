import type { MediaItem, MediaSourceProvider } from '../../../sdk/types';
import {
  decodePodcastFeedBytes,
  decodeXmlEntities,
  isSafePodcastUrl,
  parsePodcastFeed,
  stripPodcastHtml,
} from './rss';
import type { PodcastEpisode, PodcastFeed } from './rss';

export type PodcastFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PodcastSearchResult {
  id: string;
  title: string;
  author?: string;
  feedUrl: string;
  artworkUrl?: string;
  genre?: string;
  episodeCount?: number;
  providerId: string;
}

export interface PodcastDirectoryOptions {
  /** Optional Podcast Index API compatible search endpoint (e.g. proxy or self-hosted gateway). */
  podcastIndexEndpoint?: string;
  /** Optional headers for Podcast Index API authentication. */
  podcastIndexHeaders?: Record<string, string>;
}

export type StreamingPlatformKind =
  | 'rss'
  | 'apple'
  | 'spotify'
  | 'deezer'
  | 'pocketcasts'
  | 'overcast'
  | 'generic-web';

export interface DetectedPlatformLink {
  platform: StreamingPlatformKind;
  appleId?: string;
  spotifyType?: 'show' | 'episode';
  spotifyId?: string;
  slugHint?: string;
}

export interface ResolvedPodcastLink {
  kind: 'feed' | 'platform-resolved' | 'html-autodiscovery';
  platform: StreamingPlatformKind;
  originalUrl: string;
  feedUrl: string;
  title?: string;
  episodeHint?: string;
}

interface ItunesPodcastRaw {
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  trackCount?: number;
}

interface PodcastIndexFeedRaw {
  id?: number | string;
  title?: string;
  author?: string;
  ownerName?: string;
  url?: string;
  image?: string;
  artwork?: string;
  categories?: Record<string, string> | string[];
  episodeCount?: number;
}

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
const SPOTIFY_OEMBED_URL = 'https://open.spotify.com/oembed';

/** Maps an iTunes Search/Lookup JSON record to a normalized `PodcastSearchResult`. */
export function mapItunesPodcastResult(raw: ItunesPodcastRaw): PodcastSearchResult | null {
  const feedUrl = raw.feedUrl?.trim();
  const title = (raw.collectionName || raw.trackName || '').trim();
  if (!title || !isSafePodcastUrl(feedUrl)) {
    return null;
  }
  const id = String(raw.collectionId ?? raw.trackId ?? feedUrl);
  const artwork = raw.artworkUrl600 || raw.artworkUrl100;
  return {
    id: `itunes:${id}`,
    title,
    author: raw.artistName?.trim() || undefined,
    feedUrl,
    artworkUrl: isSafePodcastUrl(artwork) ? artwork.trim() : undefined,
    genre: raw.primaryGenreName?.trim() || undefined,
    episodeCount: typeof raw.trackCount === 'number' && raw.trackCount > 0 ? raw.trackCount : undefined,
    providerId: 'mplay3r-podcasts',
  };
}

/** Maps a Podcast Index JSON record to a normalized `PodcastSearchResult`. */
export function mapPodcastIndexResult(raw: PodcastIndexFeedRaw): PodcastSearchResult | null {
  const feedUrl = raw.url?.trim();
  const title = (raw.title || '').trim();
  if (!title || !isSafePodcastUrl(feedUrl)) {
    return null;
  }
  const artwork = raw.artwork || raw.image;
  let genre: string | undefined;
  if (Array.isArray(raw.categories)) {
    genre = raw.categories.find(Boolean);
  } else if (raw.categories && typeof raw.categories === 'object') {
    genre = Object.values(raw.categories).find(Boolean);
  }
  return {
    id: `podcastindex:${String(raw.id ?? feedUrl)}`,
    title,
    author: (raw.author || raw.ownerName)?.trim() || undefined,
    feedUrl,
    artworkUrl: isSafePodcastUrl(artwork) ? artwork.trim() : undefined,
    genre: genre?.trim() || undefined,
    episodeCount: typeof raw.episodeCount === 'number' && raw.episodeCount > 0 ? raw.episodeCount : undefined,
    providerId: 'mplay3r-podcasts',
  };
}

/** Searches public podcasts using the CORS-friendly iTunes Search API. */
export async function searchItunesPodcasts(
  query: string,
  fetcher: PodcastFetcher,
  options: { limit?: number; country?: string } = {},
): Promise<PodcastSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const params = new URLSearchParams({
    media: 'podcast',
    entity: 'podcast',
    term: trimmed,
    limit: String(Math.min(Math.max(options.limit ?? 15, 1), 50)),
  });
  if (options.country && /^[a-z]{2}$/i.test(options.country.trim())) {
    params.set('country', options.country.trim().toUpperCase());
  }

  const res = await fetcher(`${ITUNES_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`iTunes podcast search failed (HTTP ${res.status})`);
  }
  const payload = (await res.json()) as { results?: ItunesPodcastRaw[] };
  if (!Array.isArray(payload?.results)) {
    return [];
  }
  return payload.results.map(mapItunesPodcastResult).filter((item): item is PodcastSearchResult => item !== null);
}

/** Searches podcasts through a Podcast Index compatible API endpoint. */
export async function searchPodcastIndex(
  query: string,
  fetcher: PodcastFetcher,
  options: { endpoint: string; headers?: Record<string, string>; limit?: number },
): Promise<PodcastSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed || !isSafePodcastUrl(options.endpoint)) {
    return [];
  }
  const separator = options.endpoint.includes('?') ? '&' : '?';
  const params = new URLSearchParams({
    q: trimmed,
    max: String(Math.min(Math.max(options.limit ?? 15, 1), 50)),
  });
  const res = await fetcher(`${options.endpoint}${separator}${params.toString()}`, {
    headers: options.headers,
  });
  if (!res.ok) {
    throw new Error(`Podcast Index search failed (HTTP ${res.status})`);
  }
  const payload = (await res.json()) as { feeds?: PodcastIndexFeedRaw[] };
  if (!Array.isArray(payload?.feeds)) {
    return [];
  }
  return payload.feeds.map(mapPodcastIndexResult).filter((item): item is PodcastSearchResult => item !== null);
}

/** Classifies a URL as a direct RSS/Atom feed or a known streaming platform / podcast web page. */
export function detectStreamingPlatform(rawUrl: string): DetectedPlatformLink {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { platform: 'generic-web' };
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  // Apple Podcasts (podcasts.apple.com / itunes.apple.com)
  if (host.includes('podcasts.apple.com') || host.includes('itunes.apple.com')) {
    const idMatch = /\/id(\d+)/i.exec(pathname);
    if (idMatch?.[1]) {
      return { platform: 'apple', appleId: idMatch[1] };
    }
  }

  // Spotify Show / Episode
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
    const spotMatch = /\/(show|episode)\/([A-Za-z0-9]+)/i.exec(pathname);
    if (spotMatch?.[1] && spotMatch?.[2]) {
      return {
        platform: 'spotify',
        spotifyType: spotMatch[1].toLowerCase() as 'show' | 'episode',
        spotifyId: spotMatch[2],
      };
    }
  }

  // Deezer show URLs
  if (host.includes('deezer.com') && /\/show\/\d+/i.test(pathname)) {
    return { platform: 'deezer' };
  }

  // Pocket Casts
  if (host === 'pca.st' || host.includes('pocketcasts.com')) {
    return { platform: 'pocketcasts' };
  }

  // Overcast
  if (host.includes('overcast.fm')) {
    return { platform: 'overcast' };
  }

  // Direct RSS / Atom URL heuristic
  if (
    /\.(?:xml|rss|atom)(?:$|\?)/i.test(pathname) ||
    /(?:^|\/)(?:feed|rss|podcast\.xml)(?:\/|$)/i.test(pathname) ||
    /(?:format|type)=(?:rss|atom|xml)/i.test(parsed.search)
  ) {
    return { platform: 'rss' };
  }

  const slug = pathname
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[-_]+/g, ' ')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim();

  return {
    platform: 'generic-web',
    slugHint: slug && slug.length >= 3 ? slug : undefined,
  };
}

/** Extracts RSS/Atom `<link rel="alternate" ...>` feed URLs from an HTML document. */
export function extractAlternateFeedUrls(html: string, pageUrl: string): string[] {
  if (!html) {
    return [];
  }
  const rssUrls: string[] = [];
  const atomUrls: string[] = [];
  const linkRe = /<link\b([^>]*)>/gi;

  for (const match of html.matchAll(linkRe)) {
    const attrStr = match[1] || '';
    const relMatch = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrStr);
    const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrStr);
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrStr);

    const rel = (relMatch?.[1] ?? relMatch?.[2] ?? '').toLowerCase();
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? '').toLowerCase();
    const rawHref = decodeXmlEntities((hrefMatch?.[1] ?? hrefMatch?.[2] ?? '').trim());

    if (!rel.split(/\s+/).includes('alternate') || !rawHref) {
      continue;
    }
    const isRss = type.includes('rss+xml') || type === 'text/xml' || type === 'application/xml';
    const isAtom = type.includes('atom+xml');
    if (!isRss && !isAtom) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, pageUrl).toString();
      if (!isSafePodcastUrl(resolved)) {
        continue;
      }
      if (isRss) {
        if (!rssUrls.includes(resolved)) rssUrls.push(resolved);
      } else if (!atomUrls.includes(resolved)) {
        atomUrls.push(resolved);
      }
    } catch {
      // Ignore malformed hrefs.
    }
  }

  return [...rssUrls, ...atomUrls];
}

function extractHtmlTitleHint(html: string): string | undefined {
  const ogMatch =
    /<meta[^>]*\bproperty\s*=\s*["']og:title["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bproperty\s*=\s*["']og:title["']/i.exec(html);
  const raw = ogMatch?.[1] || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!raw) {
    return undefined;
  }
  return stripPodcastHtml(raw)
    .replace(/\s*[|–—-]\s*(?:Spotify|Apple Podcasts|Deezer|Pocket Casts|Overcast|Podcast).*$/i, '')
    .trim();
}

function normalizeLookupName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickBestPodcastMatch(results: PodcastSearchResult[], hint: string): PodcastSearchResult | null {
  if (results.length === 0) {
    return null;
  }
  const target = normalizeLookupName(hint);
  if (!target) {
    return results[0];
  }
  let best = results[0];
  let bestScore = -1;
  for (const item of results) {
    const candidate = normalizeLookupName(item.title);
    let score: number;
    if (candidate === target) {
      score = 100;
    } else if (candidate.includes(target) || target.includes(candidate)) {
      score = 60;
    } else {
      const targetWords = new Set(target.split(' '));
      const overlap = candidate.split(' ').filter(w => w.length > 2 && targetWords.has(w)).length;
      score = overlap * 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

function looksLikeXmlFeed(body: string, contentType?: string): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('rss') || ct.includes('atom') || ct.includes('xml')) {
    if (/<(?:rss|feed|rdf:rdf)\b/i.test(body.slice(0, 2048))) {
      return true;
    }
  }
  const head = body.replace(/^\uFEFF/, '').trimStart().slice(0, 1024);
  return (/^<\?xml\b/i.test(head) && /<(?:rss|feed|channel)\b/i.test(head)) || /^<(?:rss|feed)\b/i.test(head);
}

/**
 * Resolves a direct RSS/Atom URL, Apple Podcasts link, Spotify show/episode link,
 * or podcast website HTML URL to its open audio RSS feed URL.
 */
export async function resolvePlatformUrlToFeed(
  rawUrl: string,
  fetcher: PodcastFetcher,
): Promise<ResolvedPodcastLink | null> {
  const trimmed = rawUrl.trim();
  if (!isSafePodcastUrl(trimmed)) {
    return null;
  }

  const detected = detectStreamingPlatform(trimmed);

  // 1. Apple Podcasts -> iTunes Lookup API directly returns open RSS feedUrl.
  if (detected.platform === 'apple' && detected.appleId) {
    const res = await fetcher(`${ITUNES_LOOKUP_URL}?id=${encodeURIComponent(detected.appleId)}&entity=podcast`);
    if (res.ok) {
      const payload = (await res.json()) as { results?: ItunesPodcastRaw[] };
      const mapped = (payload.results ?? [])
        .map(mapItunesPodcastResult)
        .find((item): item is PodcastSearchResult => item !== null);
      if (mapped) {
        return {
          kind: 'platform-resolved',
          platform: 'apple',
          originalUrl: trimmed,
          feedUrl: mapped.feedUrl,
          title: mapped.title,
        };
      }
    }
  }

  // 2. Spotify Show/Episode -> public oEmbed metadata -> directory lookup for open RSS feed.
  if (detected.platform === 'spotify') {
    const oembedUrl = `${SPOTIFY_OEMBED_URL}?url=${encodeURIComponent(trimmed)}`;
    try {
      const oembedRes = await fetcher(oembedUrl);
      if (oembedRes.ok) {
        const meta = (await oembedRes.json()) as { title?: string; provider_name?: string };
        const titleHint = meta.title?.trim();
        if (titleHint) {
          const matches = await searchItunesPodcasts(titleHint, fetcher, { limit: 8 });
          const picked = pickBestPodcastMatch(matches, titleHint);
          if (picked) {
            return {
              kind: 'platform-resolved',
              platform: 'spotify',
              originalUrl: trimmed,
              feedUrl: picked.feedUrl,
              title: picked.title,
              episodeHint: detected.spotifyType === 'episode' ? titleHint : undefined,
            };
          }
        }
      }
    } catch {
      // Fall through to HTML / fallback check if oEmbed is unreachable.
    }
  }

  // 3. Direct RSS URLs pass straight through.
  if (detected.platform === 'rss') {
    return {
      kind: 'feed',
      platform: 'rss',
      originalUrl: trimmed,
      feedUrl: trimmed,
    };
  }

  // 4. Fetch web page: check if it is already XML, else inspect HTML `<link rel="alternate">` or title.
  try {
    const res = await fetcher(trimmed);
    if (res.ok) {
      const contentType = res.headers?.get?.('content-type') || '';
      const body = await readResponseDecodedText(res, contentType);
      if (looksLikeXmlFeed(body, contentType)) {
        return {
          kind: 'feed',
          platform: 'rss',
          originalUrl: trimmed,
          feedUrl: trimmed,
        };
      }

      const discovered = extractAlternateFeedUrls(body, trimmed);
      if (discovered.length > 0) {
        return {
          kind: 'html-autodiscovery',
          platform: detected.platform,
          originalUrl: trimmed,
          feedUrl: discovered[0],
          title: extractHtmlTitleHint(body),
        };
      }

      const titleHint = extractHtmlTitleHint(body) || detected.slugHint;
      if (titleHint) {
        const matches = await searchItunesPodcasts(titleHint, fetcher, { limit: 8 });
        const picked = pickBestPodcastMatch(matches, titleHint);
        if (picked) {
          return {
            kind: 'platform-resolved',
            platform: detected.platform,
            originalUrl: trimmed,
            feedUrl: picked.feedUrl,
            title: picked.title,
          };
        }
      }
    }
  } catch {
    if (detected.slugHint) {
      const matches = await searchItunesPodcasts(detected.slugHint, fetcher, { limit: 5 });
      const picked = pickBestPodcastMatch(matches, detected.slugHint);
      if (picked) {
        return {
          kind: 'platform-resolved',
          platform: detected.platform,
          originalUrl: trimmed,
          feedUrl: picked.feedUrl,
          title: picked.title,
        };
      }
    }
  }

  return null;
}

async function readResponseDecodedText(res: Response, contentType?: string): Promise<string> {
  if (typeof res.arrayBuffer === 'function') {
    const buffer = await res.arrayBuffer();
    return decodePodcastFeedBytes(new Uint8Array(buffer), contentType);
  }
  return res.text();
}

/** Downloads and parses a podcast RSS/Atom feed with charset auto-detection. */
export async function fetchAndParsePodcastFeed(feedUrl: string, fetcher: PodcastFetcher): Promise<PodcastFeed> {
  if (!isSafePodcastUrl(feedUrl)) {
    throw new Error('Invalid podcast feed URL (only http/https URLs are supported).');
  }
  const res = await fetcher(feedUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch podcast feed (HTTP ${res.status})`);
  }
  const contentType = res.headers?.get?.('content-type') || undefined;
  const xml = await readResponseDecodedText(res, contentType);
  return parsePodcastFeed(xml, feedUrl);
}

/** Converts a parsed `PodcastEpisode` into a standard SDK `MediaItem`. */
export function episodeToMediaItem(episode: PodcastEpisode, providerId = 'mplay3r-podcasts'): MediaItem {
  return {
    id: episode.id,
    title: episode.title,
    streamUrl: episode.audioUrl,
    artist: episode.showTitle,
    album: episode.showTitle,
    duration: episode.duration,
    publishedAt: episode.publishedAt,
    description: episode.description,
    artworkUrl: episode.artworkUrl,
    providerId,
  };
}

/**
 * Default `MediaSourceProvider` registered by `mplay3r.podcasts`.
 * Other addons (e.g. Subsonic/Navidrome, Audius, SoundCloud public) can register sibling
 * `MediaSourceProvider`s on `'media-source'` and are discovered automatically by the UI.
 */
export function createPodcastMediaSourceProvider(
  fetcher: PodcastFetcher,
  options: PodcastDirectoryOptions = {},
): MediaSourceProvider {
  return {
    id: 'mplay3r-podcasts',
    name: 'Podcasts (RSS / iTunes)',

    async search(query: string, searchOpts?: { limit?: number }): Promise<MediaItem[]> {
      const limit = searchOpts?.limit ?? 15;
      const results: PodcastSearchResult[] = [];
      const seenFeeds = new Set<string>();

      const pushUnique = (items: PodcastSearchResult[]) => {
        for (const item of items) {
          if (!seenFeeds.has(item.feedUrl)) {
            seenFeeds.add(item.feedUrl);
            results.push(item);
          }
        }
      };

      if (options.podcastIndexEndpoint) {
        try {
          const pi = await searchPodcastIndex(query, fetcher, {
            endpoint: options.podcastIndexEndpoint,
            headers: options.podcastIndexHeaders,
            limit,
          });
          pushUnique(pi);
        } catch {
          // Fall back gracefully to iTunes Search.
        }
      }

      if (results.length < limit) {
        const itunes = await searchItunesPodcasts(query, fetcher, { limit });
        pushUnique(itunes);
      }

      return results.slice(0, limit).map(show => ({
        id: show.id,
        title: show.title,
        streamUrl: show.feedUrl,
        artist: show.author,
        album: show.genre,
        artworkUrl: show.artworkUrl,
        providerId: 'mplay3r-podcasts',
      }));
    },

    async resolveUrl(url: string): Promise<MediaItem[]> {
      const resolved = await resolvePlatformUrlToFeed(url, fetcher);
      if (!resolved) {
        return [];
      }
      const feed = await fetchAndParsePodcastFeed(resolved.feedUrl, fetcher);
      return feed.episodes.map(ep => episodeToMediaItem(ep, 'mplay3r-podcasts'));
    },
  };
}
