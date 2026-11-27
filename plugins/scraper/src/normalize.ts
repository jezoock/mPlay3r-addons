/**
 * Track artist/title normalization and deterministic cache key generation
 * for high hit rates across MusicBrainz, Cover Art Archive, and LRCLIB.
 */

export interface TrackQueryInput {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface NormalizedTrackQuery {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  cacheKey: string;
}

const AUDIO_EXT_RE = /\.(?:mp3|flac|wav|ogg|oga|opus|m4a|aac|webm)$/i;
const LEADING_TRACK_NUM_RE = /^\s*(?:\d{1,3}\s*[-._)]\s+|\[\d{1,3}\]\s*)/;
const NOISE_BRACKET_RE =
  /\s*[[(]\s*(?:official(?:\s+music)?\s+video|official\s+audio|lyrics?(?:\s+video)?|audio|hd|hq|4k|remaster(?:ed)?(?:\s+\d{4})?|explicit|clean|flac|320\s*kbps|bonus\s+track|radio\s+edit|album\s+version)\s*[\])]/gi;
const FEAT_SUFFIX_RE = /\s*(?:[[(])?\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]+(?:[\])])?/gi;

/** Cleans noise suffixes, extensions, track numbers, and underscores from a raw metadata field. */
export function cleanTrackField(raw: string, options: { stripFeaturing?: boolean } = {}): string {
  let cleaned = (raw || '')
    .replace(AUDIO_EXT_RE, '')
    .replace(LEADING_TRACK_NUM_RE, '')
    .replace(/_/g, ' ')
    .replace(NOISE_BRACKET_RE, '');

  if (options.stripFeaturing) {
    cleaned = cleaned.replace(FEAT_SUFFIX_RE, '');
  }

  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

/** Normalizes text into an ASCII lowercase key segment for cache deduplication. */
export function normalizeCachePart(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Normalizes a track's artist/title/album into a clean lookup query + deterministic `cacheKey`.
 * Splits `"Artist - Title"` filenames automatically when `artist` is missing or generic.
 */
export function normalizeTrackQuery(track: TrackQueryInput): NormalizedTrackQuery | null {
  const rawTitle = (track.title || '').trim();
  const rawArtist = (track.artist || '').trim();
  const isGenericArtist =
    !rawArtist || /^(?:unknown(?:\s+artist)?|various(?:\s+artists)?|live(?:\s+radio)?)$/i.test(rawArtist);

  let artist = isGenericArtist ? '' : rawArtist;
  let title = rawTitle;

  // Ignore live radio prefixes such as "LIVE · Eclectic"
  if (/^live\s*[·-]/i.test(artist)) {
    artist = '';
  }

  if (!artist) {
    const preCleaned = title.replace(AUDIO_EXT_RE, '').replace(LEADING_TRACK_NUM_RE, '');
    const splitMatch = /^(.+?)\s+[-–—]\s+(.+)$/.exec(preCleaned);
    if (splitMatch?.[1] && splitMatch?.[2]) {
      artist = splitMatch[1].trim();
      title = splitMatch[2].trim();
    }
  }

  const cleanArtist = cleanTrackField(artist, { stripFeaturing: true });
  const cleanTitle = cleanTrackField(title, { stripFeaturing: true });
  const cleanAlbum = track.album ? cleanTrackField(track.album) : undefined;

  if (!cleanTitle) {
    return null;
  }

  const keyArtist = normalizeCachePart(cleanArtist);
  const keyTitle = normalizeCachePart(cleanTitle);
  const keyAlbum = cleanAlbum ? normalizeCachePart(cleanAlbum) : '';
  const cacheKey = `${keyArtist}::${keyTitle}${keyAlbum ? `::${keyAlbum}` : ''}`;

  return {
    artist: cleanArtist,
    title: cleanTitle,
    album: cleanAlbum || undefined,
    duration: typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0
      ? Math.round(track.duration)
      : undefined,
    cacheKey,
  };
}
