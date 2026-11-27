import type { RadioProvider, RadioStation } from '../../../sdk/types';

export const BBOX_DEFAULT_M3U_URL = 'http://mabbox.bytel.fr/radio/playlist.m3u';
export const BBOX_PROVIDER_ID = 'bbox-bouygues';

/** Curated French FM/DAB+ IP fallback streams when outside a Bouygues Bbox LAN. */
export const BBOX_FM_FALLBACK: readonly RadioStation[] = [
  {
    id: 'bbox:rtl',
    name: 'RTL',
    streamUrl: 'https://streamer-02.rtl.fr/rtl-1-44-128',
    country: 'FR',
    genre: 'Généraliste · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: BBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'bbox:europe1',
    name: 'Europe 1',
    streamUrl: 'https://stream.europe1.fr/europe1.mp3',
    country: 'FR',
    genre: 'Info · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: BBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'bbox:france-inter',
    name: 'France Inter',
    streamUrl: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3',
    country: 'FR',
    genre: 'Généraliste · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: BBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'bbox:fip',
    name: 'FIP',
    streamUrl: 'https://icecast.radiofrance.fr/fip-hifi.aac',
    country: 'FR',
    genre: 'Éclectique · FM',
    codec: 'AAC',
    bitrate: 192,
    providerId: BBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'bbox:nova',
    name: 'Radio Nova',
    streamUrl: 'https://novazz.ice.infomaniak.ch/novazz-128.mp3',
    country: 'FR',
    genre: 'Éclectique · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: BBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'bbox:tsf-jazz',
    name: 'TSF Jazz',
    streamUrl: 'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3',
    country: 'FR',
    genre: 'Jazz · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: BBOX_PROVIDER_ID,
    isLive: true,
  },
];

const BBOX_RADIO_NAME_RE =
  /\b(?:radio|fip|france\s*(?:inter|info|culture|musique|bleu)|ici\s+[a-z]|mouv'?|rtl2?|europe\s*[12]|rmc|rfm|nrj|skyrock|nostalgie|fun\s*radio|nova|tsf\s*jazz|ch[eé]rie\s*fm|rire\s*&\s*chansons|bfm\s*radio|ou[iï]\s*fm)\b/i;

export function isBboxRadioEntry(title: string, url: string, group?: string): boolean {
  if (group && /radio/i.test(group)) return true;
  if (/[?&]type=radio\b|\/radio\b/i.test(url)) return true;
  if (/^\s*(?:6\d{2}|8\d{2})\s*[-–—]/.test(title)) return true;
  return BBOX_RADIO_NAME_RE.test(title);
}

export function normalizeBboxStationName(rawTitle: string): string {
  return rawTitle
    .replace(/^\s*\d{1,5}\s*[-–—]\s*/, '')
    .replace(/\s*\((?:bas d[eé]bit|standard|hd|sd|auto)\)\s*$/i, '')
    .trim();
}

export function parseBboxRadioPlaylist(m3uContent: string): RadioStation[] {
  const lines = m3uContent.replace(/\r\n?/g, '\n').split('\n');
  const stations: RadioStation[] = [];
  const seen = new Set<string>();
  let pendingTitle = '';
  let pendingGroup = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = /group-title="([^"]*)"/i.exec(line);
      pendingGroup = groupMatch?.[1]?.trim() || '';
      const commaIdx = line.indexOf(',');
      pendingTitle = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!/^(?:https?|rtsp):\/\/\S+/i.test(line)) {
      pendingTitle = '';
      pendingGroup = '';
      continue;
    }

    const rawName = pendingTitle || line.split('/').pop() || 'Bbox Radio';
    if (isBboxRadioEntry(rawName, line, pendingGroup)) {
      const cleanName = normalizeBboxStationName(rawName);
      const dedupeKey = cleanName.toLowerCase();
      if (cleanName && !seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        stations.push({
          id: `bbox:${dedupeKey.replace(/[^a-z0-9]+/g, '-')}`,
          name: cleanName,
          streamUrl: line,
          country: 'FR',
          genre: pendingGroup || 'Bbox Radio',
          codec: line.startsWith('rtsp://') ? 'RTSP' : 'STREAM',
          providerId: BBOX_PROVIDER_ID,
          isLive: true,
        });
      }
    }
    pendingTitle = '';
    pendingGroup = '';
  }

  return stations;
}

export function createBboxRadioProvider(
  fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>,
  playlistUrl: string = BBOX_DEFAULT_M3U_URL,
): RadioProvider {
  let cached: RadioStation[] | null = null;

  const loadStations = async (): Promise<RadioStation[]> => {
    if (cached) return cached;
    try {
      const res = await fetcher(playlistUrl);
      if (res.ok) {
        const parsed = parseBboxRadioPlaylist(await res.text());
        if (parsed.length > 0) {
          cached = parsed;
          return parsed;
        }
      }
    } catch {
      // Outside Bbox LAN: fall back to curated French FM/DAB+ IP streams.
    }
    cached = [...BBOX_FM_FALLBACK];
    return cached;
  };

  return {
    id: BBOX_PROVIDER_ID,
    name: 'Bbox (Bouygues)',
    description: 'Bouygues Bbox local M3U radio bouquet with French FM/DAB+ IP fallback.',

    async listFeatured(): Promise<RadioStation[]> {
      return loadStations();
    },

    async searchStations(query: string, options?: { country?: string; genre?: string; limit?: number }): Promise<RadioStation[]> {
      const all = await loadStations();
      const q = (query || '').trim().toLowerCase();
      const genre = (options?.genre || '').trim().toLowerCase();
      const limit = options?.limit ?? 30;
      return all
        .filter(st => {
          if (q && !st.name.toLowerCase().includes(q) && !(st.genre || '').toLowerCase().includes(q)) return false;
          if (genre && !(st.genre || '').toLowerCase().includes(genre)) return false;
          return true;
        })
        .slice(0, limit);
    },
  };
}
