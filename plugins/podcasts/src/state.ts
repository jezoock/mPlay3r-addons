import type { PluginStorage } from '../../../sdk/types';
import type { PodcastFetcher } from './directory';
import { findActiveChapter, isSafePodcastUrl } from './rss';
import type { PodcastChapter, PodcastEpisode } from './rss';

export const PODCAST_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const PODCAST_SKIP_BACK_SECONDS = -15;
export const PODCAST_SKIP_FORWARD_SECONDS = 30;
export const PODCAST_RESUME_MIN_SECONDS = 5;
export const PODCAST_COMPLETE_THRESHOLD_RATIO = 0.95;
export const PODCAST_COMPLETE_REMAINING_SECONDS = 15;

const PODCAST_SUBSCRIPTIONS_KEY = 'subscriptions';
const PODCAST_PROGRESS_KEY = 'progress';
const PODCAST_RATE_KEY = 'playbackRate';
const PODCAST_OFFLINE_KEY = 'offline';
const PODCAST_OFFLINE_CACHE_NAME = 'mplay3r-podcasts-offline-v1';

export interface PodcastSubscription {
  feedUrl: string;
  title: string;
  author?: string;
  artworkUrl?: string;
  subscribedAt: string;
  lastCheckedAt?: string;
  episodeCount?: number;
}

export interface EpisodeProgress {
  episodeKey: string;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
}

export interface OfflineEpisodeRecord {
  episodeKey: string;
  audioUrl: string;
  title: string;
  showTitle: string;
  mimeType: string;
  sizeBytes: number;
  downloadedAt: string;
}

export interface PodcastPlaybackAdapter {
  seek(seconds: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  applyPlaybackRate?(rate: number): void;
}

export interface PodcastPlaybackState {
  activeEpisode: PodcastEpisode | null;
  activeTrackId: string | null;
  playbackRate: number;
  activeChapter: PodcastChapter | null;
}

/** Builds a stable persistence key for an episode across sessions. */
export function makeEpisodeKey(feedUrl: string, episodeId: string, audioUrl?: string): string {
  const scope = (feedUrl || 'direct').trim();
  const id = (episodeId || audioUrl || '').trim();
  return `${scope}::${id}`;
}

/** Clamps playback speed into the supported `[0.75, 2]` podcast range. */
export function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return 1;
  }
  const clamped = Math.min(2, Math.max(0.75, rate));
  return Math.round(clamped * 100) / 100;
}

/** Cycles to the next standard podcast playback speed (`0.75x -> 1x -> 1.25x -> 1.5x -> 1.75x -> 2x -> 0.75x`). */
export function nextPlaybackRate(current: number): number {
  const clamped = clampPlaybackRate(current);
  const next = PODCAST_PLAYBACK_RATES.find(r => r > clamped + 0.01);
  return next ?? PODCAST_PLAYBACK_RATES[0];
}

/** Computes a safe clamped seek position for relative skips such as `-15s` or `+30s`. */
export function computeSkipTarget(currentTime: number, duration: number, deltaSeconds: number): number {
  const safeCurrent = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  const safeDelta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
  const raw = Math.max(0, safeCurrent + safeDelta);
  if (Number.isFinite(duration) && duration > 0) {
    return Math.min(duration, raw);
  }
  return raw;
}

/** Determines whether playback has reached the end of an episode (`>= 95%` or `<= 15s` remaining). */
export function shouldMarkEpisodeCompleted(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) {
    return false;
  }
  if (duration <= 30) {
    return position / duration >= PODCAST_COMPLETE_THRESHOLD_RATIO;
  }
  return position / duration >= PODCAST_COMPLETE_THRESHOLD_RATIO || duration - position <= PODCAST_COMPLETE_REMAINING_SECONDS;
}

/** Computes the automatic resume timestamp (`0` if completed or under 5 seconds). */
export function computeResumePosition(progress: EpisodeProgress | null): number {
  if (!progress || progress.completed || !Number.isFinite(progress.position)) {
    return 0;
  }
  if (progress.position < PODCAST_RESUME_MIN_SECONDS) {
    return 0;
  }
  if (progress.duration > 0 && progress.position >= progress.duration - 2) {
    return 0;
  }
  return Math.floor(progress.position);
}

/** Persisted store for subscriptions, per-episode resume positions, playback speed, and offline catalog. */
export class PodcastStateStore {
  private readonly storage: PluginStorage;
  private subscriptions = new Map<string, PodcastSubscription>();
  private progress = new Map<string, EpisodeProgress>();
  private offline = new Map<string, OfflineEpisodeRecord>();
  private playbackRate = 1;
  private lastSavedPosition = new Map<string, number>();

  constructor(storage: PluginStorage) {
    this.storage = storage;
  }

  async load(): Promise<void> {
    const [subs, prog, rate, offlineRecords] = await Promise.all([
      this.storage.get<PodcastSubscription[]>(PODCAST_SUBSCRIPTIONS_KEY),
      this.storage.get<Record<string, EpisodeProgress>>(PODCAST_PROGRESS_KEY),
      this.storage.get<number>(PODCAST_RATE_KEY),
      this.storage.get<OfflineEpisodeRecord[]>(PODCAST_OFFLINE_KEY),
    ]);

    this.subscriptions.clear();
    if (Array.isArray(subs)) {
      for (const item of subs) {
        if (item && typeof item.feedUrl === 'string' && typeof item.title === 'string') {
          this.subscriptions.set(item.feedUrl, item);
        }
      }
    }

    this.progress.clear();
    this.lastSavedPosition.clear();
    if (prog && typeof prog === 'object') {
      for (const [key, entry] of Object.entries(prog)) {
        if (entry && typeof entry.position === 'number' && Number.isFinite(entry.position)) {
          this.progress.set(key, entry);
          this.lastSavedPosition.set(key, entry.position);
        }
      }
    }

    this.playbackRate = typeof rate === 'number' ? clampPlaybackRate(rate) : 1;

    this.offline.clear();
    if (Array.isArray(offlineRecords)) {
      for (const rec of offlineRecords) {
        if (rec && typeof rec.episodeKey === 'string' && typeof rec.audioUrl === 'string') {
          this.offline.set(rec.episodeKey, rec);
        }
      }
    }
  }

  listSubscriptions(): PodcastSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  isSubscribed(feedUrl: string): boolean {
    return this.subscriptions.has(feedUrl);
  }

  async subscribe(sub: Omit<PodcastSubscription, 'subscribedAt'> & { subscribedAt?: string }): Promise<PodcastSubscription> {
    const existing = this.subscriptions.get(sub.feedUrl);
    const record: PodcastSubscription = {
      ...existing,
      ...sub,
      subscribedAt: existing?.subscribedAt ?? sub.subscribedAt ?? new Date().toISOString(),
    };
    this.subscriptions.set(record.feedUrl, record);
    await this.storage.set(PODCAST_SUBSCRIPTIONS_KEY, this.listSubscriptions());
    return record;
  }

  async unsubscribe(feedUrl: string): Promise<boolean> {
    const existed = this.subscriptions.delete(feedUrl);
    if (existed) {
      await this.storage.set(PODCAST_SUBSCRIPTIONS_KEY, this.listSubscriptions());
    }
    return existed;
  }

  getProgress(episodeKey: string): EpisodeProgress | null {
    return this.progress.get(episodeKey) ?? null;
  }

  getResumePosition(episodeKey: string): number {
    return computeResumePosition(this.getProgress(episodeKey));
  }

  listProgress(): EpisodeProgress[] {
    return Array.from(this.progress.values());
  }

  /**
   * Saves per-episode listening position. Throttles writes to `>= 5s` deltas unless `force` is set
   * or the completion state changes, keeping storage I/O negligible during playback.
   */
  async saveProgress(
    episodeKey: string,
    position: number,
    duration: number,
    options: { force?: boolean } = {},
  ): Promise<EpisodeProgress | null> {
    if (!episodeKey || !Number.isFinite(position) || position < 0) {
      return null;
    }
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : (this.progress.get(episodeKey)?.duration ?? 0);
    const clampedPosition = safeDuration > 0 ? Math.min(safeDuration, position) : position;
    const completed = shouldMarkEpisodeCompleted(clampedPosition, safeDuration);
    const previous = this.progress.get(episodeKey);
    const lastSaved = this.lastSavedPosition.get(episodeKey) ?? -Infinity;

    if (!options.force && previous?.completed === completed && Math.abs(clampedPosition - lastSaved) < 5) {
      return previous ?? null;
    }

    const next: EpisodeProgress = {
      episodeKey,
      position: completed ? 0 : Math.floor(clampedPosition),
      duration: Math.round(safeDuration),
      completed,
      updatedAt: new Date().toISOString(),
    };
    this.progress.set(episodeKey, next);
    this.lastSavedPosition.set(episodeKey, clampedPosition);
    await this.persistProgress();
    return next;
  }

  async markCompleted(episodeKey: string, completed: boolean, duration = 0): Promise<EpisodeProgress> {
    const existing = this.progress.get(episodeKey);
    const next: EpisodeProgress = {
      episodeKey,
      position: 0,
      duration: duration || existing?.duration || 0,
      completed,
      updatedAt: new Date().toISOString(),
    };
    this.progress.set(episodeKey, next);
    this.lastSavedPosition.set(episodeKey, 0);
    await this.persistProgress();
    return next;
  }

  private async persistProgress(): Promise<void> {
    const obj: Record<string, EpisodeProgress> = {};
    for (const [k, v] of this.progress.entries()) {
      obj[k] = v;
    }
    await this.storage.set(PODCAST_PROGRESS_KEY, obj);
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  async setPlaybackRate(rate: number): Promise<number> {
    this.playbackRate = clampPlaybackRate(rate);
    await this.storage.set(PODCAST_RATE_KEY, this.playbackRate);
    return this.playbackRate;
  }

  async cyclePlaybackRate(): Promise<number> {
    return this.setPlaybackRate(nextPlaybackRate(this.playbackRate));
  }

  listOffline(): OfflineEpisodeRecord[] {
    return Array.from(this.offline.values());
  }

  isOffline(episodeKey: string): boolean {
    return this.offline.has(episodeKey);
  }

  getOfflineRecord(episodeKey: string): OfflineEpisodeRecord | null {
    return this.offline.get(episodeKey) ?? null;
  }

  async recordOffline(record: OfflineEpisodeRecord): Promise<void> {
    this.offline.set(record.episodeKey, record);
    await this.storage.set(PODCAST_OFFLINE_KEY, this.listOffline());
  }

  async removeOfflineRecord(episodeKey: string): Promise<boolean> {
    const existed = this.offline.delete(episodeKey);
    if (existed) {
      await this.storage.set(PODCAST_OFFLINE_KEY, this.listOffline());
    }
    return existed;
  }
}

/** Coordinates episode tracking, automatic resume, playback speed (`0.75x-2x`), and `-15s / +30s` skips. */
export class PodcastPlaybackController {
  private readonly store: PodcastStateStore;
  private readonly adapter: PodcastPlaybackAdapter;
  private readonly knownEpisodesByUrl = new Map<string, PodcastEpisode>();
  private state: PodcastPlaybackState;

  constructor(store: PodcastStateStore, adapter: PodcastPlaybackAdapter) {
    this.store = store;
    this.adapter = adapter;
    this.state = {
      activeEpisode: null,
      activeTrackId: null,
      playbackRate: store.getPlaybackRate(),
      activeChapter: null,
    };
  }

  registerEpisode(episode: PodcastEpisode, playableUrl?: string): void {
    this.knownEpisodesByUrl.set(episode.audioUrl, episode);
    if (playableUrl && playableUrl !== episode.audioUrl) {
      this.knownEpisodesByUrl.set(playableUrl, episode);
    }
  }

  getState(): PodcastPlaybackState {
    return { ...this.state };
  }

  /** Syncs controller when the active track changes; applies saved resume position and playback speed. */
  async onTrackChanged(track: { id: string; src: string } | null): Promise<{
    episode: PodcastEpisode | null;
    resumeAt: number;
    playbackRate: number;
  }> {
    if (!track) {
      this.state = {
        activeEpisode: null,
        activeTrackId: null,
        playbackRate: this.store.getPlaybackRate(),
        activeChapter: null,
      };
      return { episode: null, resumeAt: 0, playbackRate: 1 };
    }

    const episode = this.knownEpisodesByUrl.get(track.src) ?? null;
    if (!episode) {
      this.state = {
        activeEpisode: null,
        activeTrackId: track.id,
        playbackRate: this.store.getPlaybackRate(),
        activeChapter: null,
      };
      this.adapter.applyPlaybackRate?.(1);
      return { episode: null, resumeAt: 0, playbackRate: 1 };
    }

    const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
    const resumeAt = this.store.getResumePosition(key);
    const rate = this.store.getPlaybackRate();

    this.state = {
      activeEpisode: episode,
      activeTrackId: track.id,
      playbackRate: rate,
      activeChapter: findActiveChapter(episode.chapters, resumeAt),
    };

    this.adapter.applyPlaybackRate?.(rate);
    if (resumeAt > 0) {
      await this.adapter.seek(resumeAt);
    }

    return { episode, resumeAt, playbackRate: rate };
  }

  /** Updates episode resume progress & active chapter on `timeUpdate`. */
  async onTimeUpdate(currentTime: number, duration: number): Promise<PodcastChapter | null> {
    const ep = this.state.activeEpisode;
    if (!ep) {
      return null;
    }
    const key = makeEpisodeKey(ep.feedUrl, ep.id, ep.audioUrl);
    const effectiveDuration = duration > 0 ? duration : (ep.duration ?? 0);
    await this.store.saveProgress(key, currentTime, effectiveDuration);
    const chapter = findActiveChapter(ep.chapters, currentTime);
    this.state = { ...this.state, activeChapter: chapter };
    return chapter;
  }

  async setRate(rate: number): Promise<number> {
    const updated = await this.store.setPlaybackRate(rate);
    this.state = { ...this.state, playbackRate: updated };
    if (this.state.activeEpisode) {
      this.adapter.applyPlaybackRate?.(updated);
    }
    return updated;
  }

  async cycleRate(): Promise<number> {
    return this.setRate(nextPlaybackRate(this.store.getPlaybackRate()));
  }

  async skipBy(deltaSeconds: number): Promise<number> {
    const current = this.adapter.getCurrentTime();
    const duration = this.adapter.getDuration() || this.state.activeEpisode?.duration || 0;
    const target = computeSkipTarget(current, duration, deltaSeconds);
    await this.adapter.seek(target);

    if (this.state.activeEpisode) {
      const key = makeEpisodeKey(
        this.state.activeEpisode.feedUrl,
        this.state.activeEpisode.id,
        this.state.activeEpisode.audioUrl,
      );
      await this.store.saveProgress(key, target, duration, { force: true });
      this.state = {
        ...this.state,
        activeChapter: findActiveChapter(this.state.activeEpisode.chapters, target),
      };
    }

    return target;
  }

  async skipBackward(seconds = Math.abs(PODCAST_SKIP_BACK_SECONDS)): Promise<number> {
    return this.skipBy(-Math.abs(seconds));
  }

  async skipForward(seconds = PODCAST_SKIP_FORWARD_SECONDS): Promise<number> {
    return this.skipBy(Math.abs(seconds));
  }
}

export interface OfflineCacheLike {
  put(request: string, response: Response): Promise<void>;
  match(request: string): Promise<Response | undefined>;
  delete(request: string): Promise<boolean>;
}

/**
 * Manages offline episode downloads using the browser Cache API when available,
 * with a clean in-memory Blob fallback and automatic `blob:` ObjectURL lifecycle cleanup.
 */
export class OfflineEpisodeManager {
  private readonly store: PodcastStateStore;
  private readonly openCache: () => Promise<OfflineCacheLike | null>;
  private readonly memoryBlobs = new Map<string, Blob>();
  private readonly objectUrls = new Map<string, string>();

  constructor(store: PodcastStateStore, openCache?: () => Promise<OfflineCacheLike | null>) {
    this.store = store;
    this.openCache =
      openCache ??
      (async () => {
        if (typeof globalThis.caches !== 'undefined' && typeof globalThis.caches.open === 'function') {
          try {
            return (await globalThis.caches.open(PODCAST_OFFLINE_CACHE_NAME)) as unknown as OfflineCacheLike;
          } catch {
            return null;
          }
        }
        return null;
      });
  }

  async downloadEpisode(episode: PodcastEpisode, fetcher: PodcastFetcher): Promise<OfflineEpisodeRecord> {
    if (!isSafePodcastUrl(episode.audioUrl)) {
      throw new Error('Cannot download episode: invalid audio URL.');
    }
    const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
    const res = await fetcher(episode.audioUrl);
    if (!res.ok) {
      throw new Error(`Episode download failed (HTTP ${res.status})`);
    }
    const contentType = res.headers?.get?.('content-type') || episode.mimeType || 'audio/mpeg';
    const bytes = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : await (await res.blob()).arrayBuffer();
    const blob = new Blob([bytes], { type: contentType });

    const cache = await this.openCache();
    if (cache) {
      await cache.put(
        episode.audioUrl,
        new Response(blob, {
          status: 200,
          headers: { 'content-type': contentType },
        }),
      );
    } else {
      this.memoryBlobs.set(key, blob);
    }

    const record: OfflineEpisodeRecord = {
      episodeKey: key,
      audioUrl: episode.audioUrl,
      title: episode.title,
      showTitle: episode.showTitle,
      mimeType: contentType,
      sizeBytes: blob.size,
      downloadedAt: new Date().toISOString(),
    };
    await this.store.recordOffline(record);
    return record;
  }

  async resolvePlayableUrl(episode: PodcastEpisode): Promise<{ url: string; offline: boolean }> {
    const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
    const existingUrl = this.objectUrls.get(key);
    if (existingUrl) {
      return { url: existingUrl, offline: true };
    }

    let blob: Blob | null = this.memoryBlobs.get(key) ?? null;
    if (!blob) {
      const cache = await this.openCache();
      if (cache) {
        const cached = await cache.match(episode.audioUrl);
        if (cached) {
          blob = await cached.blob();
        }
      }
    }

    if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(blob);
      this.objectUrls.set(key, objectUrl);
      return { url: objectUrl, offline: true };
    }

    return { url: episode.audioUrl, offline: false };
  }

  async removeDownload(episodeKey: string): Promise<boolean> {
    const record = this.store.getOfflineRecord(episodeKey);
    const existingUrl = this.objectUrls.get(episodeKey);
    if (existingUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(existingUrl);
    }
    this.objectUrls.delete(episodeKey);
    this.memoryBlobs.delete(episodeKey);

    if (record) {
      const cache = await this.openCache();
      if (cache) {
        await cache.delete(record.audioUrl);
      }
    }

    return this.store.removeOfflineRecord(episodeKey);
  }

  dispose(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const objectUrl of this.objectUrls.values()) {
        URL.revokeObjectURL(objectUrl);
      }
    }
    this.objectUrls.clear();
  }
}
