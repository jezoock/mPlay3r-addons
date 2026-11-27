import type { RadioProvider, RadioStation } from '../../../sdk/types';

export const RADIO_BROWSER_API_BASE = 'https://de1.api.radio-browser.info/json';

export interface RadioBrowserStationRaw {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  countrycode?: string;
  country?: string;
  tags?: string;
  bitrate?: number;
  codec?: string;
  homepage?: string;
  favicon?: string;
}

function isHttpStreamUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Maps a raw Radio Browser API object into a clean, safe `RadioStation`. */
export function mapRadioBrowserStation(raw: RadioBrowserStationRaw): RadioStation | null {
  const streamUrl = (raw.url_resolved || raw.url || '').trim();
  const name = (raw.name || '').trim();
  if (!name || !streamUrl || !isHttpStreamUrl(streamUrl)) {
    return null;
  }

  const firstTag = (raw.tags || '')
    .split(',')
    .map(t => t.trim())
    .find(Boolean);

  return {
    id: (raw.stationuuid || streamUrl).trim(),
    name,
    streamUrl,
    country: (raw.countrycode || raw.country || '').trim().toUpperCase() || undefined,
    genre: firstTag || undefined,
    bitrate: typeof raw.bitrate === 'number' && raw.bitrate > 0 ? raw.bitrate : undefined,
    codec: (raw.codec || '').trim().toUpperCase() || undefined,
    homepage: raw.homepage && isHttpStreamUrl(raw.homepage) ? raw.homepage : undefined,
    favicon: raw.favicon && isHttpStreamUrl(raw.favicon) ? raw.favicon : undefined,
    providerId: 'radio-browser',
    isLive: true,
  };
}

/** Creates the built-in Radio Browser `RadioProvider` (40,000+ web & FM/DAB+ IP stations). */
export function createRadioBrowserProvider(
  fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>,
  apiBase = RADIO_BROWSER_API_BASE,
): RadioProvider {
  const fetchStations = async (endpoint: string): Promise<RadioStation[]> => {
    const response = await fetcher(`${apiBase}${endpoint}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Radio Browser HTTP ${response.status}`);
    }
    const rawList = (await response.json()) as unknown;
    if (!Array.isArray(rawList)) {
      return [];
    }
    return rawList
      .map(entry => mapRadioBrowserStation(entry as RadioBrowserStationRaw))
      .filter((station): station is RadioStation => station !== null);
  };

  return {
    id: 'radio-browser',
    name: 'Radio Browser (Global & FM IP)',
    description: 'Open community directory of 40,000+ web and FM/DAB+ IP stations',
    async searchStations(query, options = {}) {
      const params = new URLSearchParams({
        hidebroken: 'true',
        order: 'clickcount',
        reverse: 'true',
        limit: String(options.limit ?? 25),
      });
      if (query.trim()) {
        params.set('name', query.trim());
      }
      if (options.country?.trim()) {
        params.set('countrycode', options.country.trim().toUpperCase());
      }
      if (options.genre?.trim()) {
        params.set('tag', options.genre.trim().toLowerCase());
      }
      return fetchStations(`/stations/search?${params.toString()}`);
    },
    async listFeatured() {
      return fetchStations('/stations/topclick/15?hidebroken=true');
    },
  };
}
