import type { RadioProvider, RadioStation } from '../../../sdk/types';

export const FREEBOX_MULTIPOSTE_M3U_URL = 'http://mafreebox.freebox.fr/freeboxtv/playlist.m3u';
export const FREEBOX_PROVIDER_ID = 'freebox-multiposte';

/** Curated French public FM/DAB+ IP streams used if the local Freebox LAN playlist is unreachable. */
export const FREEBOX_PUBLIC_FM_FALLBACK: readonly RadioStation[] = [
  {
    id: 'freebox:france-inter',
    name: 'France Inter',
    streamUrl: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3',
    country: 'FR',
    genre: 'Généraliste · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: FREEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'freebox:franceinfo',
    name: 'franceinfo',
    streamUrl: 'https://icecast.radiofrance.fr/franceinfo-midfi.mp3',
    country: 'FR',
    genre: 'Info · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: FREEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'freebox:fip',
    name: 'FIP',
    streamUrl: 'https://icecast.radiofrance.fr/fip-hifi.aac',
    country: 'FR',
    genre: 'Éclectique · FM',
    codec: 'AAC',
    bitrate: 192,
    providerId: FREEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'freebox:france-culture',
    name: 'France Culture',
    streamUrl: 'https://icecast.radiofrance.fr/franceculture-midfi.mp3',
    country: 'FR',
    genre: 'Culture · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: FREEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'freebox:france-musique',
    name: 'France Musique',
    streamUrl: 'https://icecast.radiofrance.fr/francemusique-hifi.aac',
    country: 'FR',
    genre: 'Classique · FM',
    codec: 'AAC',
    bitrate: 192,
    providerId: FREEBOX_PROVIDER_ID,
    isLive: true,
  },
  {
    id: 'freebox:mouv',
    name: "Mouv'",
    streamUrl: 'https://icecast.radiofrance.fr/mouv-midfi.mp3',
    country: 'FR',
    genre: 'Hip-Hop · FM',
    codec: 'MP3',
    bitrate: 128,
    providerId: FREEBOX_PROVIDER_ID,
    isLive: true,
  },
];

const KNOWN_FR_RADIO_NAME_RE =
  /\b(?:radio|fip|france\s*inter|france\s*info|france\s*culture|france\s*musique|france\s*bleu|ici\s+[a-z]|mouv'?|rtl2?|europe\s*[12]|rmc|rfm|nrj|skyrock|nostalgie|fun\s*radio|nova|tsf\s*jazz|ch[eé]rie\s*fm|rire\s*&\s*chansons|bfm\s*radio|ou[iï]\s*fm|fg\s*dj|klassik|jazz\s*radio|sud\s*radio|beur\s*fm)\b/i;

/**
 * Determines whether a Freebox multiposte M3U entry represents a radio channel
 * (filtering out TV video channels like TF1, France 2, Arte, M6).
 */
export function isFreeboxRadioEntry(title: string, url: string, group?: string): boolean {
  if (group && /radio/i.test(group)) {
    return true;
  }
  if (/[?&]type=radio\b|\/radio\b/i.test(url)) {
    return true;
  }
  // Freebox multiposte assigns channel numbers >= 10000 to radio bouquets (e.g. `10001 - France Inter`).
  if (/^\s*1\d{4}\s*[-–—]/.test(title)) {
    return true;
  }
  return KNOWN_FR_RADIO_NAME_RE.test(title);
}

/** Strips leading Freebox multiposte numbering (`10001 - France Inter` -> `France Inter`). */
export function normalizeFreeboxStationName(rawTitle: string): string {
  return rawTitle
    .replace(/^\s*\d{1,5}\s*[-–—]\s*/, '')
    .replace(/\s*\((?:bas d[eé]bit|standard|hd|auto)\)\s*$/i, '')
    .trim();
}

/**
 * Parses a Freebox multiposte `.m3u` playlist and extracts only radio stations,
 * deduplicating duplicate quality variants by normalized station name.
 */
export function parseFreeboxMultipostePlaylist(m3uContent: string): RadioStation[] {
  const lines = m3uContent.replace(/\r\n?/g, '\n').split('\n');
  const stations: RadioStation[] = [];
  const seenNames = new Set<string>();

  let pendingTitle = '';
  let pendingGroup = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      pendingGroup = groupMatch?.[1]?.trim() ?? '';
      const commaIdx = line.indexOf(',');
      pendingTitle = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      continue;
    }

    if (line.startsWith('#EXTGRP:')) {
      pendingGroup = line.slice('#EXTGRP:'.length).trim();
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    if (!/^(?:https?|rtsp):\/\//i.test(line)) {
      pendingTitle = '';
      pendingGroup = '';
      continue;
    }

    if (isFreeboxRadioEntry(pendingTitle, line, pendingGroup)) {
      const name = normalizeFreeboxStationName(pendingTitle) || 'Freebox Radio';
      const dedupeKey = name.toLowerCase();
      if (!seenNames.has(dedupeKey)) {
        seenNames.add(dedupeKey);
        stations.push({
          id: `freebox:${dedupeKey.replace(/[^a-z0-9]+/g, '-')}`,
          name,
          streamUrl: line,
          country: 'FR',
          genre: pendingGroup || 'Freebox Multiposte',
          codec: line.toLowerCase().startsWith('rtsp://') ? 'RTSP' : 'STREAM',
          providerId: FREEBOX_PROVIDER_ID,
          isLive: true,
        });
      }
    }

    pendingTitle = '';
    pendingGroup = '';
  }

  return stations;
}

/** Creates the Freebox `RadioProvider`, reading the local multiposte playlist with French FM IP fallback. */
export function createFreeboxRadioProvider(
  fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>,
  playlistUrl = FREEBOX_MULTIPOSTE_M3U_URL,
): RadioProvider {
  let cachedStations: RadioStation[] | null = null;

  const loadStations = async (): Promise<RadioStation[]> => {
    if (cachedStations) {
      return cachedStations;
    }
    try {
      const res = await fetcher(playlistUrl);
      if (res.ok) {
        const text = await res.text();
        const parsed = parseFreeboxMultipostePlaylist(text);
        if (parsed.length > 0) {
          cachedStations = parsed;
          return parsed;
        }
      }
    } catch {
      // Freebox LAN endpoint unreachable (user outside home network or browser CORS); fall back cleanly.
    }
    cachedStations = [...FREEBOX_PUBLIC_FM_FALLBACK];
    return cachedStations;
  };

  return {
    id: FREEBOX_PROVIDER_ID,
    name: 'Freebox (Multiposte & FM FR)',
    description: 'Freebox multiposte M3U radio channels with French public FM IP fallback',
    async searchStations(query, options = {}) {
      const all = await loadStations();
      const q = query.trim().toLowerCase();
      const country = options.country?.trim().toUpperCase();
      const genre = options.genre?.trim().toLowerCase();
      const limit = options.limit ?? 30;

      return all
        .filter(station => {
          if (country && station.country && station.country !== country) {
            return false;
          }
          if (genre && !(station.genre || '').toLowerCase().includes(genre)) {
            return false;
          }
          if (!q) {
            return true;
          }
          return `${station.name} ${station.genre ?? ''}`.toLowerCase().includes(q);
        })
        .slice(0, limit);
    },
    async listFeatured() {
      return (await loadStations()).slice(0, 20);
    },
  };
}
