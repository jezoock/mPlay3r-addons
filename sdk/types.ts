/**
 * Shared TypeScript SDK contracts matching `mPlay3r/src/plugins/types.ts` (zero runtime code).
 */

export type PlaybackStatus = 'stopped' | 'playing' | 'paused' | 'loading' | 'error';

export type PluginCategory = 'source' | 'broadcast' | 'visualizer' | 'scraper' | 'dsp' | 'theme';

export type PluginPermission =
  | 'playback-control'
  | 'playlist-write'
  | 'track-metadata'
  | 'audio-analyser'
  | 'audio-context'
  | 'network'
  | 'local-server'
  | 'ui-slot'
  | 'theme'
  | 'storage';

export type PluginSlotName = 'panel' | 'visualizer' | 'track-info' | 'theme-root';
export type PluginRuntimeTarget = 'all' | 'desktop' | 'web';

export interface Track {
  id: string;
  src: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  format?: string;
  filePath?: string;
  isObjectUrl?: boolean;
}

export interface TrackInput {
  id?: string;
  src: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  format?: string;
  filePath?: string;
  isObjectUrl?: boolean;
}

export interface PlayerSnapshot {
  status: PlaybackStatus;
  currentTrack: Track | null;
  currentIndex: number;
  tracks: Track[];
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  balance: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  showRemaining: boolean;
  palette: string;
  showEqualizer: boolean;
  showPlaylist: boolean;
  compact: boolean;
  errorMessage?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  permissions: PluginPermission[];
  minCoreVersion?: string;
  author?: string;
  homepage?: string;
  entry?: string;
  sha256?: string;
  sizeBytes?: number;
  runtime?: PluginRuntimeTarget;
}

export type PluginDisposer = () => void;
export type TrackMetadataPatch = Partial<Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'format'>>;

export interface PluginEventMap {
  stateChange: PlayerSnapshot;
  trackChange: { track: Track | null; index: number };
  timeUpdate: { currentTime: number; duration: number; remaining: number };
  playlistChange: { tracks: Track[]; currentIndex: number };
  paletteChange: { palette: string };
  error: { message: string };
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PluginSlotDescriptor {
  id: string;
  slot: Exclude<PluginSlotName, 'theme-root'>;
  title?: string;
  icon?: string;
  mount(container: HTMLElement, playerTarget: string): void | PluginDisposer | Promise<void | PluginDisposer>;
}

export interface PluginThemeDescriptor {
  id: string;
  name: string;
  css?: string;
  mountLayout?(container: HTMLElement, playerTarget: string): void | PluginDisposer | Promise<void | PluginDisposer>;
}

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  country?: string;
  genre?: string;
  bitrate?: number;
  codec?: string;
  homepage?: string;
  favicon?: string;
  providerId: string;
  isLive?: boolean;
}

export interface RadioProvider {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  searchStations(query: string, options?: { country?: string; genre?: string; limit?: number }): Promise<RadioStation[]>;
  listFeatured?(): Promise<RadioStation[]>;
}

export interface MediaItem {
  id: string;
  title: string;
  streamUrl: string;
  artist?: string;
  album?: string;
  duration?: number;
  publishedAt?: string;
  description?: string;
  artworkUrl?: string;
  providerId: string;
}

export interface MediaSourceProvider {
  readonly id: string;
  readonly name: string;
  search(query: string, options?: { limit?: number }): Promise<MediaItem[]>;
  resolveUrl?(url: string): Promise<MediaItem[]>;
}

export type PluginProviderKind = 'radio' | 'media-source';

export interface PluginProviderTypeMap {
  radio: RadioProvider;
  'media-source': MediaSourceProvider;
}

export interface PluginPlaybackApi {
  play(): Promise<void>;
  pause(): Promise<void>;
  togglePlay(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getStatus(): PlaybackStatus;
}

export interface PluginPlaylistApi {
  addTracks(inputs: TrackInput[], autoplayIfEmpty?: boolean): Promise<Track[]>;
  removeTrack(id: string): Promise<void>;
  clearPlaylist(): Promise<void>;
}

export interface PluginContext {
  readonly manifest: Readonly<PluginManifest>;
  readonly playerTarget: string;
  readonly coreVersion: string;
  readonly playback: PluginPlaybackApi;
  readonly playlist: PluginPlaylistApi;
  readonly storage: PluginStorage;

  getState(): PlayerSnapshot;
  on<K extends keyof PluginEventMap>(event: K, listener: (payload: PluginEventMap[K]) => void): PluginDisposer;
  updateTrackMetadata(trackId: string, patch: TrackMetadataPatch): Promise<boolean>;
  getAudioAnalyser(): Promise<AnalyserNode | null>;
  getAudioContext(): Promise<AudioContext | null>;
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  registerSlot(slot: PluginSlotDescriptor): PluginDisposer;
  registerTheme(theme: PluginThemeDescriptor): PluginDisposer;
  registerProvider<K extends PluginProviderKind>(kind: K, provider: PluginProviderTypeMap[K]): PluginDisposer;
  getProviders<K extends PluginProviderKind>(kind: K): PluginProviderTypeMap[K][];
  notify(message: string, variant?: '' | 'success' | 'warning' | 'error'): Promise<void>;
}

export interface MPlay3rPlugin {
  readonly manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
