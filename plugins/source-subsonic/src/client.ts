import type { MediaItem, MediaSourceProvider } from '../../../sdk/types';
import { md5Hex } from './md5';

export type SubsonicFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface SubsonicConfig {
  baseUrl: string;
  username: string;
  password: string;
  clientName?: string;
  apiVersion?: string;
  maxBitRate?: number;
}

export interface SubsonicSong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  suffix?: string;
  bitRate?: number;
  coverArt?: string;
  track?: number;
  year?: number;
}

export interface SubsonicPlaylist {
  id: string;
  name: string;
  songCount: number;
  duration?: number;
  owner?: string;
}

export interface SubsonicPingInfo {
  ok: boolean;
  serverVersion?: string;
  serverType?: string;
  openSubsonic?: boolean;
  errorMessage?: string;
}

interface SubsonicEnvelope {
  'subsonic-response'?: {
    status?: 'ok' | 'failed';
    version?: string;
    type?: string;
    openSubsonic?: boolean;
    error?: { code?: number; message?: string };
    searchResult3?: { song?: SubsonicSong[] };
    playlists?: { playlist?: SubsonicPlaylist[] };
    playlist?: { id?: string; name?: string; entry?: SubsonicSong[] };
    randomSongs?: { song?: SubsonicSong[] };
  };
}

export const SUBSONIC_PROVIDER_ID = 'mplay3r-subsonic';
const DEFAULT_SUBSONIC_API_VERSION = '1.16.1';
const DEFAULT_SUBSONIC_CLIENT = 'mPlay3r';

/** Validates and normalizes a Subsonic/Navidrome base URL (stripping trailing `/rest` or `/`). */
export function normalizeSubsonicUrl(raw: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:\/|$))/i.test(trimmed);
  const withScheme = hasExplicitScheme ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const cleanPath = parsed.pathname.replace(/\/rest\/?$/i, '').replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return null;
  }
}

/** Generates a random alphanumeric salt for Subsonic API v1.13+ salted token authentication. */
export function generateSubsonicSalt(length = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(Math.max(6, length));
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let salt = '';
  for (const b of bytes) salt += alphabet[b % alphabet.length];
  return salt;
}

/** Builds Subsonic REST query parameters using salted MD5 (`t = md5(password + salt)`). */
export function buildSubsonicQuery(
  config: SubsonicConfig,
  extra: Record<string, string | number | undefined> = {},
  fixedSalt?: string,
): URLSearchParams {
  const salt = fixedSalt || generateSubsonicSalt(12);
  const token = md5Hex(`${config.password}${salt}`);
  const params = new URLSearchParams({
    u: config.username.trim(),
    t: token,
    s: salt,
    v: config.apiVersion || DEFAULT_SUBSONIC_API_VERSION,
    c: config.clientName || DEFAULT_SUBSONIC_CLIENT,
    f: 'json',
  });
  for (const [key, val] of Object.entries(extra)) {
    if (val !== undefined && val !== '') {
      params.set(key, String(val));
    }
  }
  return params;
}

/**
 * Lightweight Subsonic / OpenSubsonic / Navidrome REST client.
 * Never sends plaintext passwords — uses salted MD5 tokens on every API and stream URL.
 */
export class SubsonicClient {
  private readonly fetcher: SubsonicFetcher;
  private config: SubsonicConfig | null = null;

  constructor(fetcher: SubsonicFetcher, initialConfig?: SubsonicConfig | null) {
    this.fetcher = fetcher;
    if (initialConfig) {
      this.configure(initialConfig);
    }
  }

  configure(config: SubsonicConfig): SubsonicConfig {
    const normalized = normalizeSubsonicUrl(config.baseUrl);
    if (!normalized) {
      throw new Error('Invalid Subsonic / Navidrome server URL (expected http:// or https://).');
    }
    if (!config.username?.trim() || !config.password) {
      throw new Error('Subsonic username and password are required.');
    }
    this.config = {
      ...config,
      baseUrl: normalized,
      username: config.username.trim(),
    };
    return { ...this.config };
  }

  clearConfig(): void {
    this.config = null;
  }

  getConfig(): SubsonicConfig | null {
    return this.config ? { ...this.config } : null;
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  private requireConfig(): SubsonicConfig {
    if (!this.config) {
      throw new Error('Subsonic / Navidrome server is not configured.');
    }
    return this.config;
  }

  private async request(
    endpoint: string,
    extra: Record<string, string | number | undefined> = {},
  ): Promise<NonNullable<SubsonicEnvelope['subsonic-response']>> {
    const cfg = this.requireConfig();
    const params = buildSubsonicQuery(cfg, extra);
    const res = await this.fetcher(`${cfg.baseUrl}/rest/${endpoint}.view?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Subsonic server error (HTTP ${res.status})`);
    }
    const envelope = (await res.json()) as SubsonicEnvelope;
    const body = envelope['subsonic-response'];
    if (!body) {
      throw new Error('Invalid Subsonic JSON response envelope.');
    }
    if (body.status === 'failed') {
      const code = body.error?.code;
      const msg = body.error?.message || 'Subsonic request failed';
      throw new Error(code !== undefined ? `Subsonic error ${code}: ${msg}` : msg);
    }
    return body;
  }

  async ping(): Promise<SubsonicPingInfo> {
    try {
      const body = await this.request('ping');
      return {
        ok: true,
        serverVersion: body.version,
        serverType: body.type,
        openSubsonic: Boolean(body.openSubsonic),
      };
    } catch (err) {
      return {
        ok: false,
        errorMessage: err instanceof Error ? err.message : 'Unable to reach Subsonic server.',
      };
    }
  }

  async searchSongs(query: string, limit = 25): Promise<SubsonicSong[]> {
    const body = await this.request('search3', {
      query: query.trim(),
      songCount: Math.min(100, Math.max(1, limit)),
      albumCount: 0,
      artistCount: 0,
    });
    return Array.isArray(body.searchResult3?.song) ? body.searchResult3.song : [];
  }

  async getPlaylists(): Promise<SubsonicPlaylist[]> {
    const body = await this.request('getPlaylists');
    return Array.isArray(body.playlists?.playlist) ? body.playlists.playlist : [];
  }

  async getPlaylistSongs(playlistId: string): Promise<SubsonicSong[]> {
    const body = await this.request('getPlaylist', { id: playlistId });
    return Array.isArray(body.playlist?.entry) ? body.playlist.entry : [];
  }

  async getRandomSongs(size = 20): Promise<SubsonicSong[]> {
    const body = await this.request('getRandomSongs', { size: Math.min(100, Math.max(1, size)) });
    return Array.isArray(body.randomSongs?.song) ? body.randomSongs.song : [];
  }

  /** Builds a salted-token audio streaming URL for `/rest/stream.view`. */
  getStreamUrl(songId: string, fixedSalt?: string): string {
    const cfg = this.requireConfig();
    const params = buildSubsonicQuery(
      cfg,
      {
        id: songId,
        maxBitRate: cfg.maxBitRate && cfg.maxBitRate > 0 ? cfg.maxBitRate : undefined,
      },
      fixedSalt,
    );
    return `${cfg.baseUrl}/rest/stream.view?${params.toString()}`;
  }

  getCoverArtUrl(coverArtId: string, size = 300, fixedSalt?: string): string {
    const cfg = this.requireConfig();
    const params = buildSubsonicQuery(cfg, { id: coverArtId, size }, fixedSalt);
    return `${cfg.baseUrl}/rest/getCoverArt.view?${params.toString()}`;
  }

  songToMediaItem(song: SubsonicSong): MediaItem {
    return {
      id: `subsonic:${song.id}`,
      title: song.title,
      streamUrl: this.getStreamUrl(song.id),
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      artworkUrl: song.coverArt ? this.getCoverArtUrl(song.coverArt, 300) : undefined,
      providerId: SUBSONIC_PROVIDER_ID,
    };
  }
}

/** Exposes the configured Subsonic / Navidrome server as an open SDK `MediaSourceProvider`. */
export function createSubsonicMediaSourceProvider(client: SubsonicClient): MediaSourceProvider {
  return {
    id: SUBSONIC_PROVIDER_ID,
    name: 'Subsonic / Navidrome',
    async search(query: string, options?: { limit?: number }): Promise<MediaItem[]> {
      if (!client.isConfigured()) return [];
      const songs = query.trim()
        ? await client.searchSongs(query, options?.limit ?? 20)
        : await client.getRandomSongs(options?.limit ?? 20);
      return songs.map(song => client.songToMediaItem(song));
    },
  };
}
