/**
 * Zero-dependency RSS 2.0 / Atom / iTunes / Podlove Chapters podcast feed parser.
 * Works identically in browser, WebView, and Node.js without requiring DOMParser.
 */

export interface PodcastChapter {
  startSeconds: number;
  title: string;
  href?: string;
}

export interface PodcastEpisode {
  id: string;
  feedUrl: string;
  showTitle: string;
  title: string;
  audioUrl: string;
  mimeType?: string;
  byteLength?: number;
  duration?: number;
  publishedAt?: string;
  description?: string;
  artworkUrl?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  chapters: PodcastChapter[];
}

export interface PodcastFeed {
  feedUrl: string;
  title: string;
  author?: string;
  description?: string;
  artworkUrl?: string;
  link?: string;
  language?: string;
  categories: string[];
  episodes: PodcastEpisode[];
}

const XML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
};

/** Returns true only for safe HTTP(S) URLs. */
export function isSafePodcastUrl(url: string | undefined): url is string {
  if (!url) {
    return false;
  }
  const trimmed = url.trim();
  return /^https?:\/\/\S+/i.test(trimmed);
}

/** Decodes raw RSS/Atom bytes honoring HTTP Content-Type charset and XML declaration encoding. */
export function decodePodcastFeedBytes(bytes: Uint8Array, contentType?: string): string {
  if (bytes.byteLength === 0) {
    return '';
  }

  let charset: string | undefined;

  // Check UTF-16 BOMs first.
  if (bytes.byteLength >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      charset = 'utf-16le';
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      charset = 'utf-16be';
    }
  }

  // Extract charset from HTTP Content-Type header if present.
  if (!charset && contentType) {
    const headerMatch = /charset\s*=\s*["']?([A-Za-z0-9._-]+)["']?/i.exec(contentType);
    if (headerMatch?.[1]) {
      charset = headerMatch[1].trim();
    }
  }

  // Peek ASCII header to read XML declaration encoding="...".
  if (!charset) {
    const headLen = Math.min(bytes.byteLength, 256);
    let asciiHead = '';
    for (let i = 0; i < headLen; i += 1) {
      asciiHead += String.fromCharCode(bytes[i]);
    }
    const xmlMatch = /<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._-]+)["']/i.exec(asciiHead);
    if (xmlMatch?.[1]) {
      charset = xmlMatch[1].trim();
    }
  }

  const normalized = (charset || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(normalized, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/** Decodes CDATA wrappers and named/numeric XML entities. */
export function decodeXmlEntities(input: string): string {
  if (!input) {
    return '';
  }
  const unwrapped = input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return unwrapped.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, token: string) => {
    if (token.startsWith('#x') || token.startsWith('#X')) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
    }
    if (token.startsWith('#')) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
    }
    return XML_NAMED_ENTITIES[token.toLowerCase()] ?? full;
  });
}

/** Strips HTML markup from podcast show notes while preserving readable line breaks. */
export function stripPodcastHtml(input: string): string {
  if (!input) {
    return '';
  }
  const decoded = decodeXmlEntities(input);
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parses `HH:MM:SS(.ms)`, `MM:SS`, `1h 23m 45s`, or raw seconds into seconds (`>= 0`). */
export function parsePodcastTimestamp(raw: string | number | undefined): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : undefined;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  const value = raw.trim();
  if (!value) {
    return undefined;
  }

  // Raw numeric seconds (e.g. "3665" or "125.5")
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  // Colon-separated HH:MM:SS(.ms) or MM:SS(.ms)
  const colonParts = value.split(':');
  if (colonParts.length === 2 || colonParts.length === 3) {
    const nums = colonParts.map(part => Number.parseFloat(part.trim()));
    if (nums.every(n => Number.isFinite(n) && n >= 0)) {
      if (nums.length === 3) {
        return nums[0] * 3600 + nums[1] * 60 + nums[2];
      }
      return nums[0] * 60 + nums[1];
    }
  }

  // Human-readable forms like "1h 20m 15s" or "45m 10s"
  const humanMatch = /^(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?)?$/i.exec(
    value,
  );
  if (humanMatch && (humanMatch[1] || humanMatch[2] || humanMatch[3])) {
    const hours = humanMatch[1] ? Number.parseInt(humanMatch[1], 10) : 0;
    const mins = humanMatch[2] ? Number.parseInt(humanMatch[2], 10) : 0;
    const secs = humanMatch[3] ? Number.parseFloat(humanMatch[3]) : 0;
    return hours * 3600 + mins * 60 + secs;
  }

  return undefined;
}

/** Parses a podcast episode duration into positive whole seconds, or `undefined` if missing/invalid. */
export function parsePodcastDuration(raw: string | number | undefined): number | undefined {
  const secs = parsePodcastTimestamp(raw);
  if (secs === undefined || secs <= 0) {
    return undefined;
  }
  return Math.round(secs);
}

/** Formats seconds into `MM:SS` or `H:MM:SS` for podcast UI display. */
export function formatPodcastTime(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad2(mins)}:${pad2(secs)}` : `${mins}:${pad2(secs)}`;
}

function parseXmlAttributes(attrSource: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of attrSource.matchAll(attrRe)) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? '';
    attrs[key] = decodeXmlEntities(val.trim());
  }
  return attrs;
}

function escapeTagName(tagName: string): string {
  return tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTagText(xml: string, tagNames: string[]): string | undefined {
  for (const name of tagNames) {
    const escaped = escapeTagName(name);
    const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = re.exec(xml);
    if (match?.[1] !== undefined) {
      const value = decodeXmlEntities(match[1]).trim();
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function extractTagBlocks(xml: string, tagName: string): string[] {
  const escaped = escapeTagName(tagName);
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  const results: string[] = [];
  for (const match of xml.matchAll(re)) {
    results.push(match[1]);
  }
  return results;
}

function extractOpenTags(xml: string, tagName: string): Array<Record<string, string>> {
  const escaped = escapeTagName(tagName);
  const re = new RegExp(`<${escaped}\\b([^>]*)>`, 'gi');
  const results: Array<Record<string, string>> = [];
  for (const match of xml.matchAll(re)) {
    results.push(parseXmlAttributes(match[1] || ''));
  }
  return results;
}

/** Extracts Podlove Simple Chapters (`<psc:chapter start="..." title="..."/>`) from an episode XML block. */
export function parsePodloveChapters(itemXml: string): PodcastChapter[] {
  const chapters: PodcastChapter[] = [];
  for (const attrs of extractOpenTags(itemXml, 'psc:chapter')) {
    const startSeconds = parsePodcastTimestamp(attrs.start);
    const title = attrs.title?.trim();
    if (startSeconds !== undefined && title) {
      chapters.push({
        startSeconds,
        title,
        href: isSafePodcastUrl(attrs.href) ? attrs.href.trim() : undefined,
      });
    }
  }
  return chapters.sort((a, b) => a.startSeconds - b.startSeconds);
}

/** Extracts timestamped chapters from plain show notes (e.g. `(00:05:30) Intro` or `12:45 - Topic`). */
export function extractInlineChapters(notesText: string): PodcastChapter[] {
  if (!notesText) {
    return [];
  }
  const chapters: PodcastChapter[] = [];
  const seenTimes = new Set<number>();
  const lineRe = /^\s*(?:\(|\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\)|\])?\s*[-–—:|]?\s+(.+?)\s*$/;

  for (const line of notesText.split(/\r?\n/)) {
    const match = lineRe.exec(line);
    if (!match) {
      continue;
    }
    const startSeconds = parsePodcastTimestamp(match[1]);
    const title = match[2].trim();
    if (startSeconds === undefined || !title || title.length > 140 || seenTimes.has(startSeconds)) {
      continue;
    }
    seenTimes.add(startSeconds);
    chapters.push({ startSeconds, title });
  }

  return chapters.length >= 2 ? chapters.sort((a, b) => a.startSeconds - b.startSeconds) : [];
}

/** Returns the active chapter at `currentTimeSeconds`, or `null` if none applies. */
export function findActiveChapter(chapters: PodcastChapter[], currentTimeSeconds: number): PodcastChapter | null {
  if (!chapters || chapters.length === 0 || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return null;
  }
  let active: PodcastChapter | null = null;
  for (const chapter of chapters) {
    if (chapter.startSeconds <= currentTimeSeconds + 0.25) {
      active = chapter;
    } else {
      break;
    }
  }
  return active;
}

function normalizeIsoDate(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw.trim();
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractArtworkFromXml(xml: string): string | undefined {
  for (const attrs of extractOpenTags(xml, 'itunes:image')) {
    if (isSafePodcastUrl(attrs.href)) {
      return attrs.href.trim();
    }
  }
  for (const attrs of extractOpenTags(xml, 'media:thumbnail')) {
    if (isSafePodcastUrl(attrs.url)) {
      return attrs.url.trim();
    }
  }
  const imageBlock = extractTagBlocks(xml, 'image')[0];
  if (imageBlock) {
    const url = extractTagText(imageBlock, ['url']);
    if (isSafePodcastUrl(url)) {
      return url.trim();
    }
  }
  const atomLogo = extractTagText(xml, ['logo', 'icon']);
  if (isSafePodcastUrl(atomLogo)) {
    return atomLogo.trim();
  }
  return undefined;
}

function extractEnclosureFromItem(itemXml: string): { audioUrl: string; mimeType?: string; byteLength?: number } | null {
  const enclosures = extractOpenTags(itemXml, 'enclosure');
  for (const enc of enclosures) {
    if (!isSafePodcastUrl(enc.url)) {
      continue;
    }
    const type = enc.type?.toLowerCase() || '';
    if (!type || type.startsWith('audio/') || type === 'application/octet-stream' || type.includes('mpegurl')) {
      return {
        audioUrl: enc.url.trim(),
        mimeType: enc.type || undefined,
        byteLength: parsePositiveInt(enc.length),
      };
    }
  }

  for (const media of extractOpenTags(itemXml, 'media:content')) {
    if (!isSafePodcastUrl(media.url)) {
      continue;
    }
    const type = media.type?.toLowerCase() || '';
    const medium = media.medium?.toLowerCase() || '';
    if (medium === 'audio' || type.startsWith('audio/') || /\.(?:mp3|m4a|aac|ogg|opus|flac|wav)(?:$|\?)/i.test(media.url)) {
      return {
        audioUrl: media.url.trim(),
        mimeType: media.type || undefined,
        byteLength: parsePositiveInt(media.filesize),
      };
    }
  }

  for (const link of extractOpenTags(itemXml, 'link')) {
    if ((link.rel || '').toLowerCase() === 'enclosure' && isSafePodcastUrl(link.href)) {
      const type = link.type?.toLowerCase() || '';
      if (!type || type.startsWith('audio/') || type === 'application/octet-stream') {
        return {
          audioUrl: link.href.trim(),
          mimeType: link.type || undefined,
          byteLength: parsePositiveInt(link.length),
        };
      }
    }
  }

  return null;
}

function parseRssFeed(xml: string, feedUrl: string): PodcastFeed {
  const channelXml = extractTagBlocks(xml, 'channel')[0] ?? xml;
  const firstItemIdx = channelXml.search(/<item(?:\s|>)/i);
  const channelHeader = firstItemIdx >= 0 ? channelXml.slice(0, firstItemIdx) : channelXml;

  const title = stripPodcastHtml(extractTagText(channelHeader, ['title']) || '') || 'Untitled Podcast';
  const author =
    stripPodcastHtml(extractTagText(channelHeader, ['itunes:author', 'dc:creator', 'managingEditor', 'author']) || '') ||
    undefined;
  const description =
    stripPodcastHtml(extractTagText(channelHeader, ['itunes:summary', 'description', 'itunes:subtitle']) || '') || undefined;
  const artworkUrl = extractArtworkFromXml(channelHeader);
  const link = extractTagText(channelHeader, ['link']);
  const language = extractTagText(channelHeader, ['language']);

  const categoriesSet = new Set<string>();
  for (const attrs of extractOpenTags(channelHeader, 'itunes:category')) {
    if (attrs.text) {
      categoriesSet.add(attrs.text);
    }
  }
  for (const catText of extractTagBlocks(channelHeader, 'category')) {
    const clean = stripPodcastHtml(catText);
    if (clean) {
      categoriesSet.add(clean);
    }
  }

  const itemBlocks = extractTagBlocks(channelXml, 'item');
  const episodes: PodcastEpisode[] = [];

  for (let idx = 0; idx < itemBlocks.length; idx += 1) {
    const itemXml = itemBlocks[idx];
    const enclosure = extractEnclosureFromItem(itemXml);
    if (!enclosure) {
      continue;
    }

    const epTitle = stripPodcastHtml(extractTagText(itemXml, ['itunes:title', 'title']) || '') || `Episode ${idx + 1}`;
    const rawDescription =
      extractTagText(itemXml, ['content:encoded', 'description', 'itunes:summary', 'itunes:subtitle']) || '';
    const epDescription = stripPodcastHtml(rawDescription) || undefined;
    const podloveChapters = parsePodloveChapters(itemXml);
    const chapters = podloveChapters.length > 0 ? podloveChapters : extractInlineChapters(epDescription || '');
    const guid = extractTagText(itemXml, ['guid']) || enclosure.audioUrl;

    episodes.push({
      id: guid,
      feedUrl,
      showTitle: title,
      title: epTitle,
      audioUrl: enclosure.audioUrl,
      mimeType: enclosure.mimeType,
      byteLength: enclosure.byteLength,
      duration: parsePodcastDuration(extractTagText(itemXml, ['itunes:duration', 'duration'])),
      publishedAt: normalizeIsoDate(extractTagText(itemXml, ['pubDate', 'dc:date', 'published'])),
      description: epDescription,
      artworkUrl: extractArtworkFromXml(itemXml) || artworkUrl,
      episodeNumber: parsePositiveInt(extractTagText(itemXml, ['itunes:episode'])),
      seasonNumber: parsePositiveInt(extractTagText(itemXml, ['itunes:season'])),
      chapters,
    });
  }

  return {
    feedUrl,
    title,
    author,
    description,
    artworkUrl,
    link: isSafePodcastUrl(link) ? link.trim() : undefined,
    language,
    categories: Array.from(categoriesSet),
    episodes,
  };
}

function parseAtomFeed(xml: string, feedUrl: string): PodcastFeed {
  const feedXml = extractTagBlocks(xml, 'feed')[0] ?? xml;
  const firstEntryIdx = feedXml.search(/<entry(?:\s|>)/i);
  const feedHeader = firstEntryIdx >= 0 ? feedXml.slice(0, firstEntryIdx) : feedXml;

  const title = stripPodcastHtml(extractTagText(feedHeader, ['title']) || '') || 'Untitled Podcast';
  const authorBlock = extractTagBlocks(feedHeader, 'author')[0];
  const author =
    stripPodcastHtml(
      (authorBlock ? extractTagText(authorBlock, ['name']) : undefined) ||
        extractTagText(feedHeader, ['itunes:author', 'dc:creator']) ||
        '',
    ) || undefined;
  const description = stripPodcastHtml(extractTagText(feedHeader, ['subtitle', 'itunes:summary']) || '') || undefined;
  const artworkUrl = extractArtworkFromXml(feedHeader);

  let link: string | undefined;
  for (const attrs of extractOpenTags(feedHeader, 'link')) {
    if ((!attrs.rel || attrs.rel === 'alternate') && isSafePodcastUrl(attrs.href)) {
      link = attrs.href.trim();
      break;
    }
  }

  const categoriesSet = new Set<string>();
  for (const attrs of extractOpenTags(feedHeader, 'category')) {
    const label = attrs.label || attrs.term;
    if (label) {
      categoriesSet.add(label);
    }
  }

  const entries = extractTagBlocks(feedXml, 'entry');
  const episodes: PodcastEpisode[] = [];

  for (let idx = 0; idx < entries.length; idx += 1) {
    const entryXml = entries[idx];
    const enclosure = extractEnclosureFromItem(entryXml);
    if (!enclosure) {
      continue;
    }

    const epTitle = stripPodcastHtml(extractTagText(entryXml, ['title']) || '') || `Episode ${idx + 1}`;
    const rawDesc = extractTagText(entryXml, ['content', 'summary', 'itunes:summary']) || '';
    const epDescription = stripPodcastHtml(rawDesc) || undefined;
    const podloveChapters = parsePodloveChapters(entryXml);
    const chapters = podloveChapters.length > 0 ? podloveChapters : extractInlineChapters(epDescription || '');
    const id = extractTagText(entryXml, ['id']) || enclosure.audioUrl;

    episodes.push({
      id,
      feedUrl,
      showTitle: title,
      title: epTitle,
      audioUrl: enclosure.audioUrl,
      mimeType: enclosure.mimeType,
      byteLength: enclosure.byteLength,
      duration: parsePodcastDuration(extractTagText(entryXml, ['itunes:duration', 'duration'])),
      publishedAt: normalizeIsoDate(extractTagText(entryXml, ['published', 'updated'])),
      description: epDescription,
      artworkUrl: extractArtworkFromXml(entryXml) || artworkUrl,
      episodeNumber: parsePositiveInt(extractTagText(entryXml, ['itunes:episode'])),
      seasonNumber: parsePositiveInt(extractTagText(entryXml, ['itunes:season'])),
      chapters,
    });
  }

  return {
    feedUrl,
    title,
    author,
    description,
    artworkUrl,
    link,
    categories: Array.from(categoriesSet),
    episodes,
  };
}

/** Parses an RSS 2.0 or Atom podcast XML document into a normalized `PodcastFeed`. */
export function parsePodcastFeed(xml: string, feedUrl = ''): PodcastFeed {
  const cleaned = (xml || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    return {
      feedUrl,
      title: 'Untitled Podcast',
      categories: [],
      episodes: [],
    };
  }
  const isAtom = /<feed(?:\s|>)/i.test(cleaned) && !/<channel(?:\s|>)/i.test(cleaned);
  return isAtom ? parseAtomFeed(cleaned, feedUrl) : parseRssFeed(cleaned, feedUrl);
}
