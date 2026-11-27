import type { PluginStorage, RadioStation } from '../../../sdk/types';
import type { IcyMetadata } from './icy';

const FAVORITES_STORAGE_KEY = 'favorites';

/** Computes exponential reconnect delay (ms) capped at `maxMs`. Returns `null` once `maxAttempts` is exceeded. */
export function computeReconnectDelayMs(
  attempt: number,
  options: { baseMs?: number; maxMs?: number; maxAttempts?: number } = {},
): number | null {
  const baseMs = options.baseMs ?? 1500;
  const maxMs = options.maxMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 5;
  if (attempt < 0 || attempt >= maxAttempts) {
    return null;
  }
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

export interface LiveStreamState {
  isLive: boolean;
  seekDisabled: boolean;
  station: RadioStation | null;
  trackId: string | null;
  nowPlaying?: string;
  reconnecting: boolean;
  reconnectAttempt: number;
}

/** Tracks live radio playback state, seek lock, ICY title updates, and reconnection attempts. */
export class LiveStreamTracker {
  private state: LiveStreamState = {
    isLive: false,
    seekDisabled: false,
    station: null,
    trackId: null,
    reconnecting: false,
    reconnectAttempt: 0,
  };
  private readonly knownLiveStreams = new Map<string, RadioStation>();

  registerLiveStation(station: RadioStation): void {
    this.knownLiveStreams.set(station.streamUrl, station);
  }

  onTrackChanged(track: { id: string; src: string } | null): LiveStreamState {
    if (!track) {
      return this.clear();
    }
    const station = this.knownLiveStreams.get(track.src) ?? null;
    if (!station) {
      return this.clear();
    }
    this.state = {
      isLive: true,
      seekDisabled: true,
      station,
      trackId: track.id,
      nowPlaying: undefined,
      reconnecting: false,
      reconnectAttempt: 0,
    };
    return this.getState();
  }

  applyIcyMetadata(meta: IcyMetadata): LiveStreamState {
    if (!this.state.isLive || !meta.streamTitle) {
      return this.getState();
    }
    this.state = {
      ...this.state,
      nowPlaying: meta.streamTitle,
    };
    return this.getState();
  }

  /** Registers a stream drop and returns the next reconnect delay in ms, or `null` if retries are exhausted. */
  scheduleReconnect(options?: { baseMs?: number; maxMs?: number; maxAttempts?: number }): number | null {
    if (!this.state.isLive) {
      return null;
    }
    const delay = computeReconnectDelayMs(this.state.reconnectAttempt, options);
    if (delay === null) {
      this.state = { ...this.state, reconnecting: false };
      return null;
    }
    this.state = {
      ...this.state,
      reconnecting: true,
      reconnectAttempt: this.state.reconnectAttempt + 1,
    };
    return delay;
  }

  markRecovered(): LiveStreamState {
    this.state = {
      ...this.state,
      reconnecting: false,
      reconnectAttempt: 0,
    };
    return this.getState();
  }

  clear(): LiveStreamState {
    this.state = {
      isLive: false,
      seekDisabled: false,
      station: null,
      trackId: null,
      nowPlaying: undefined,
      reconnecting: false,
      reconnectAttempt: 0,
    };
    return this.getState();
  }

  getState(): LiveStreamState {
    return { ...this.state };
  }
}

/** Persisted favorite radio stations store backed by `ctx.storage`. */
export class RadioFavoritesStore {
  private readonly storage: PluginStorage;
  private stations = new Map<string, RadioStation>();

  constructor(storage: PluginStorage) {
    this.storage = storage;
  }

  async load(): Promise<RadioStation[]> {
    const saved = await this.storage.get<RadioStation[]>(FAVORITES_STORAGE_KEY);
    this.stations.clear();
    if (Array.isArray(saved)) {
      for (const item of saved) {
        if (item && typeof item.id === 'string' && typeof item.streamUrl === 'string' && typeof item.name === 'string') {
          this.stations.set(item.id, item);
        }
      }
    }
    return this.list();
  }

  has(stationId: string): boolean {
    return this.stations.has(stationId);
  }

  list(): RadioStation[] {
    return Array.from(this.stations.values());
  }

  async toggle(station: RadioStation): Promise<boolean> {
    let added: boolean;
    if (this.stations.has(station.id)) {
      this.stations.delete(station.id);
      added = false;
    } else {
      this.stations.set(station.id, station);
      added = true;
    }
    await this.storage.set(FAVORITES_STORAGE_KEY, this.list());
    return added;
  }
}
