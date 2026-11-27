import type { MediaItem, MediaSourceProvider, PluginStorage } from '../../../sdk/types';
import { normalizeServerBaseUrl, sanitizeRelativeFolder } from './protocol';
import type {
  LanConnectionState,
  LibraryPage,
  SavedLanServer,
  SharedPlaylist,
  SharedServerInfo,
  SharedTrack,
} from './protocol';

export type LanFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type RemoteLibraryErrorCode = 'invalid-url' | 'unauthorized' | 'network' | 'timeout' | 'http';

export class RemoteLibraryError extends Error {
  readonly code: RemoteLibraryErrorCode;
  readonly status?: number;

  constructor(code: RemoteLibraryErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'RemoteLibraryError';
    this.code = code;
    this.status = status;
  }
}

export interface RemoteClientSnapshot {
  state: LanConnectionState;
  baseUrl: string | null;
  serverInfo: SharedServerInfo | null;
  lastError: string | null;
}

export interface ConnectLanOptions {
  baseUrl: string;
  pin?: string;
  token?: string;
}

export interface ListLibraryOptions {
  folder?: string;
  query?: string;
  page?: number;
  limit?: number;
}

const SAVED_SERVERS_STORAGE_KEY = 'savedServers';

/**
 * Remote mPlay3r LAN library client (works in both Web and Desktop runtimes).
 * Handles PIN-to-Bearer authentication, folder browsing, paginated search, playlists,
 * authenticated audio streaming URLs, and resilient connection-loss recovery.
 */
export class RemoteLibraryClient {
  private readonly fetcher: LanFetcher;
  private readonly timeoutMs: number;
  private state: LanConnectionState = 'disconnected';
  private baseUrl: string | null = null;
  private token = '';
  private serverInfo: SharedServerInfo | null = null;
  private lastError: string | null = null;
  private readonly listeners = new Set<(snap: RemoteClientSnapshot) => void>();

  constructor(fetcher: LanFetcher, options: { timeoutMs?: number } = {}) {
    this.fetcher = fetcher;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  getSnapshot(): RemoteClientSnapshot {
    return {
      state: this.state,
      baseUrl: this.baseUrl,
      serverInfo: this.serverInfo ? { ...this.serverInfo } : null,
      lastError: this.lastError,
    };
  }

  getToken(): string {
    return this.token;
  }

  onStateChange(listener: (snap: RemoteClientSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private setState(next: LanConnectionState, error: string | null = null): void {
    this.state = next;
    this.lastError = error;
    this.emitState();
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
    try {
      return await this.fetcher(url, {
        ...init,
        signal: controller?.signal,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? `Connection to LAN server timed out after ${this.timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : 'Network connection to LAN server lost';
      if (this.baseUrl) {
        this.setState('reconnecting', msg);
      } else {
        this.setState('error', msg);
      }
      throw new RemoteLibraryError(isAbort ? 'timeout' : 'network', msg);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Connects to a remote LAN share server via PIN or existing Bearer token. */
  async connect(options: ConnectLanOptions): Promise<{ info: SharedServerInfo; token: string }> {
    const normalized = normalizeServerBaseUrl(options.baseUrl);
    if (!normalized) {
      const err = new RemoteLibraryError('invalid-url', 'Invalid LAN server URL (expected http://host:port)');
      this.setState('error', err.message);
      throw err;
    }

    this.baseUrl = normalized;
    this.setState('connecting', null);

    const infoRes = await this.fetchWithTimeout(`${normalized}/api/info`);
    if (!infoRes.ok) {
      const msg = `Unable to reach mPlay3r LAN server (HTTP ${infoRes.status})`;
      this.setState('error', msg);
      throw new RemoteLibraryError('http', msg, infoRes.status);
    }
    const info = (await infoRes.json()) as SharedServerInfo;

    let token = (options.token || '').trim();
    if (!token && options.pin) {
      const authRes = await this.fetchWithTimeout(`${normalized}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: options.pin.trim() }),
      });
      if (authRes.status === 401) {
        this.setState('error', 'Invalid LAN PIN');
        throw new RemoteLibraryError('unauthorized', 'Invalid LAN PIN', 401);
      }
      if (!authRes.ok) {
        const msg = `LAN authentication failed (HTTP ${authRes.status})`;
        this.setState('error', msg);
        throw new RemoteLibraryError('http', msg, authRes.status);
      }
      const authData = (await authRes.json()) as { token?: string };
      token = (authData.token || '').trim();
    }

    if (!token) {
      this.setState('error', 'A valid PIN or Bearer token is required');
      throw new RemoteLibraryError('unauthorized', 'A valid PIN or Bearer token is required', 401);
    }

    this.token = token;
    this.serverInfo = info;

    // Verify token works before reporting connected.
    await this.listLibrary({ page: 1, limit: 1 });
    this.setState('connected', null);
    return { info, token };
  }

  disconnect(): void {
    this.baseUrl = null;
    this.token = '';
    this.serverInfo = null;
    this.setState('disconnected', null);
  }

  /** Probes server availability and recovers state back to `connected` when reachable again. */
  async ping(): Promise<boolean> {
    if (!this.baseUrl || !this.token) {
      return false;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/info`);
      if (!res.ok) {
        this.setState('reconnecting', `Server returned HTTP ${res.status}`);
        return false;
      }
      this.serverInfo = (await res.json()) as SharedServerInfo;
      this.setState('connected', null);
      return true;
    } catch {
      return false;
    }
  }

  /** Lists paginated folders and tracks with optional folder filter and search query. */
  async listLibrary(options: ListLibraryOptions = {}): Promise<LibraryPage> {
    if (!this.baseUrl || !this.token) {
      throw new RemoteLibraryError('unauthorized', 'Not connected to a LAN server');
    }

    const safeFolder = sanitizeRelativeFolder(options.folder ?? '');
    if (safeFolder === null) {
      throw new RemoteLibraryError('invalid-url', 'Folder path contains forbidden traversal segments');
    }

    const page = Math.max(1, Math.floor(options.page ?? 1));
    const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)));
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (safeFolder) params.set('folder', safeFolder);
    if (options.query?.trim()) params.set('q', options.query.trim());

    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/library?${params.toString()}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (res.status === 401) {
      this.setState('error', 'Session expired or invalid token (HTTP 401)');
      throw new RemoteLibraryError('unauthorized', 'Unauthorized (HTTP 401)', 401);
    }
    if (!res.ok) {
      const msg = `Failed to load LAN library (HTTP ${res.status})`;
      this.setState('error', msg);
      throw new RemoteLibraryError('http', msg, res.status);
    }

    const data = (await res.json()) as LibraryPage;
    if (this.state === 'reconnecting') {
      this.setState('connected', null);
    }
    return data;
  }

  /** Fetches shared playlists exposed by the connected LAN server. */
  async listPlaylists(): Promise<SharedPlaylist[]> {
    if (!this.baseUrl || !this.token) {
      throw new RemoteLibraryError('unauthorized', 'Not connected to a LAN server');
    }
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/playlists`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 401) {
      this.setState('error', 'Session expired or invalid token (HTTP 401)');
      throw new RemoteLibraryError('unauthorized', 'Unauthorized (HTTP 401)', 401);
    }
    if (!res.ok) {
      const msg = `Failed to load LAN playlists (HTTP ${res.status})`;
      this.setState('error', msg);
      throw new RemoteLibraryError('http', msg, res.status);
    }
    const payload = (await res.json()) as { playlists?: SharedPlaylist[] };
    if (this.state === 'reconnecting') {
      this.setState('connected', null);
    }
    return Array.isArray(payload.playlists) ? payload.playlists : [];
  }

  /** Builds a Range-capable authenticated stream URL for `<audio>` / `<mplay3r-app>` playback. */
  getStreamUrl(trackId: string): string {
    if (!this.baseUrl || !this.token) {
      throw new RemoteLibraryError('unauthorized', 'Not connected to a LAN server');
    }
    return `${this.baseUrl}/api/stream/${encodeURIComponent(trackId)}?token=${encodeURIComponent(this.token)}`;
  }

  /** Maps a shared LAN track to an SDK `MediaItem`. */
  trackToMediaItem(track: SharedTrack): MediaItem {
    return {
      id: `lan:${track.id}`,
      title: track.title,
      streamUrl: this.getStreamUrl(track.id),
      artist: this.serverInfo?.name || 'LAN Library',
      album: track.folder,
      providerId: 'mplay3r-lan-client',
    };
  }
}

/** Persists previously connected LAN servers (URL + Bearer token) via `ctx.storage`. */
export class SavedServersStore {
  private readonly storage: PluginStorage;
  private servers = new Map<string, SavedLanServer>();

  constructor(storage: PluginStorage) {
    this.storage = storage;
  }

  async load(): Promise<SavedLanServer[]> {
    const raw = await this.storage.get<SavedLanServer[]>(SAVED_SERVERS_STORAGE_KEY);
    this.servers.clear();
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item && typeof item.baseUrl === 'string' && typeof item.token === 'string') {
          this.servers.set(item.baseUrl, item);
        }
      }
    }
    return this.list();
  }

  list(): SavedLanServer[] {
    return Array.from(this.servers.values());
  }

  async save(server: Omit<SavedLanServer, 'id' | 'lastConnectedAt'>): Promise<SavedLanServer> {
    const normalized = normalizeServerBaseUrl(server.baseUrl) ?? server.baseUrl;
    const record: SavedLanServer = {
      id: normalized,
      name: server.name || normalized,
      baseUrl: normalized,
      token: server.token,
      lastConnectedAt: new Date().toISOString(),
    };
    this.servers.set(normalized, record);
    await this.storage.set(SAVED_SERVERS_STORAGE_KEY, this.list());
    return record;
  }

  async remove(baseUrl: string): Promise<boolean> {
    const existed = this.servers.delete(baseUrl);
    if (existed) {
      await this.storage.set(SAVED_SERVERS_STORAGE_KEY, this.list());
    }
    return existed;
  }
}

/** Exposes the active remote LAN library connection as a standard `MediaSourceProvider`. */
export function createLanClientMediaSourceProvider(client: RemoteLibraryClient): MediaSourceProvider {
  return {
    id: 'mplay3r-lan-client',
    name: 'LAN Shared Library',
    async search(query: string, options?: { limit?: number }): Promise<MediaItem[]> {
      if (client.getSnapshot().state !== 'connected') {
        return [];
      }
      const page = await client.listLibrary({
        query,
        page: 1,
        limit: options?.limit ?? 20,
      });
      return page.tracks.map(t => client.trackToMediaItem(t));
    },
  };
}
