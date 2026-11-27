import type { RadioProvider, RadioStation } from '../../../sdk/types';

export const LIVEBOX_DEFAULT_M3U_URL = 'http://livebox.home/radio/playlist.m3u';
export const LIVEBOX_PROVIDER_ID = 'livebox-orange';

/** Curated French FM/DAB+ IP fallback streams when outside an Orange Livebox LAN. */
export const LIVEBOX_FM_FALLBACK: readonly RadioStation[] = [
  {
    id: 'livebox:france-culture',
    name: 'France Culture',
    streamUrl: 'https://icecast.radiofrance.fr/franceculture-midfi.mp3',
    country: 'FR',
    genre: 'Culture · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: LIVEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'livebox:france-musique',
    name: 'France Musique',
    streamUrl: 'https://icecast.radiofrance.fr/francemusique-hifi.aac',
    country: 'FR',
    genre: 'Classique · FM',
    codec: 'AAC',
    bitrate: 192,
    providerId: LIVEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'livebox:franceinfo',
    name: 'franceinfo',
    streamUrl: 'https://icecast.radiofrance.fr/franceinfo-midfi.mp3',
    country: 'FR',
    genre: 'Info · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: LIVEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'livebox:rtl2',
    name: 'RTL2',
    streamUrl: 'https://streamer-02.rtl.fr/rtl2-1-44-128',
    country: 'FR',
    genre: 'Pop Rock · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: LIVEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'livebox:rfm',
    name: 'RFM',
    streamUrl: 'https://stream.rfm.fr/rfm.mp3',
    country: 'FR',
    genre: 'Pop · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: LIVEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'livebox:ouifm',
    name: 'OÜI FM',
    streamUrl: 'https://ouifm.ice.infomaniak.ch/ouifm-high.mp3',
    country: 'FR',
    genre: 'Rock · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: LIVEBOX_PROVIDER_ID,
    isLive: true,
  },
];

const LIVEBOX_RADIO_NAME_RE =
  /\b(?:radio|fip|france\s*(?:inter|info|culture|musique|bleu)|ici\s+[a-z]|mouv'?|rtl2?|europe\s*[12]|rmc|rfm|nrj|skyrock|nostalgie|fun\s*radio|nova|tsf\s*jazz|ch[eé]rie\s*fm|ou[iï]\s*fm)\b/i;

export function isLiveboxRadioEntry(title: string, url: string, group?: string): boolean {
  if (group && /radio/i.test(group)) return true;
  if (/[?&]type=radio\b|\/radio\b/i.test(url)) return true;
  if (/^\s*9\d{2}\s*[-–—]/.test(title)) return true;
  return LIVEBOX_RADIO_NAME_RE.test(title);
}

export function normalizeLiveboxStationName(rawTitle: string): string {
  return rawTitle
    .replace(/^\s*\d{1,5}\s*[-–—]\s*/, '')
    .replace(/\s*\((?:aac|mp3|hd|sd|orange|livebox)\)\s*$/i, '')
    .trim();
}

export function parseLiveboxRadioPlaylist(m3uContent: string): RadioStation[] {
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

    const rawName = pendingTitle || line.split('/').pop() || 'Livebox Radio';
    if (isLiveboxRadioEntry(rawName, line, pendingGroup)) {
      const cleanName = normalizeLiveboxStationName(rawName);
      const dedupeKey = cleanName.toLowerCase();
      if (cleanName && !seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        stations.push({
          id: `livebox:${dedupeKey.replace(/[^a-z0-9]+/g, '-')}`,
          name: cleanName,
          streamUrl: line,
          country: 'FR',
          genre: pendingGroup || 'Livebox Radio',
          codec: line.startsWith('rtsp://') ? 'RTSP' : 'STREAM',
          providerId: LIVEBOX_PROVIDER_ID,
          isLive: true,
        });
      }
    }
    pendingTitle = '';
    pendingGroup = '';
  }

  return stations;
}

export function createLiveboxRadioProvider(
  fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>,
  playlistUrl: string = LIVEBOX_DEFAULT_M3U_URL,
): RadioProvider {
  let cached: RadioStation[] | null = null;

  const loadStations = async (): Promise<RadioStation[]> => {
    if (cached) return cached;
    try {
      const res = await fetcher(playlistUrl);
      if (res.ok) {
        const parsed = parseLiveboxRadioPlaylist(await res.text());
        if (parsed.length > 0) {
          cached = parsed;
          return parsed;
        }
      }
    } catch {
      // Outside Livebox LAN: fall back to curated French FM/DAB+ IP streams.
    }
    cached = [...LIVEBOX_FM_FALLBACK];
    return cached;
  };

  return {
    id: LIVEBOX_PROVIDER_ID,
    name: 'Livebox (Orange)',
    description: 'Orange Livebox local M3U radio bouquet with French FM/DAB+ IP fallback.',

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
