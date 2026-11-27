import type { PlaybackStatus, Track } from '../../../sdk/types';

export const DEFAULT_DRIFT_TOLERANCE_SECONDS = 0.6;

export interface BroadcastTrackMeta {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  streamUrl: string;
  duration?: number;
  format?: string;
}

export interface BroadcastSyncState {
  sessionId: string;
  status: 'playing' | 'paused' | 'stopped';
  track: BroadcastTrackMeta | null;
  positionSeconds: number;
  playbackRate: number;
  updatedAtMs: number;
  listenerCount: number;
  sequence: number;
}

export interface LocalPlaybackSnapshot {
  trackId: string | null;
  trackSrc?: string | null;
  status: PlaybackStatus;
  currentTime: number;
}

export interface SyncReconciliationPlan {
  loadTrack: BroadcastTrackMeta | null;
  seekTo: number | null;
  targetStatus: 'playing' | 'paused' | 'stopped';
  expectedPosition: number;
  driftSeconds: number;
}

export interface ParsedSseEvent {
  event: string;
  id?: string;
  data: string;
}

export interface SseEventSourceLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  addEventListener?(type: string, listener: (ev: { data: string }) => void): void;
  close(): void;
}

export interface ListenerPlaybackHooks {
  loadTrack(track: BroadcastTrackMeta): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(seconds: number): Promise<void>;
  getLocalState(): LocalPlaybackSnapshot;
}

function broadcastRandomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < len; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** Generates a random URL-safe hex session token for broadcast authorization. */
export function generateBroadcastToken(byteLength = 16): string {
  const bytes = broadcastRandomBytes(Math.max(8, byteLength));
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Validates session token syntax (8..128 safe URL characters). */
export function isValidSessionTokenFormat(token: string | undefined): token is string {
  if (!token) return false;
  return /^[A-Za-z0-9._-]{8,128}$/.test(token.trim());
}

/** Constant-time string comparison for session token validation. */
export function constantTimeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Projects the host's live playback position forward to `nowMs`, compensating for
 * network one-way latency (`oneWayLatencyMs`) when status is `'playing'`.
 */
export function estimateRemotePosition(
  state: BroadcastSyncState,
  nowMs: number = Date.now(),
  oneWayLatencyMs = 0,
): number {
  if (state.status === 'stopped' || !state.track) {
    return 0;
  }
  const base = Number.isFinite(state.positionSeconds) && state.positionSeconds > 0 ? state.positionSeconds : 0;
  let projected = base;
  if (state.status === 'playing') {
    const rate = Number.isFinite(state.playbackRate) && state.playbackRate > 0 ? state.playbackRate : 1;
    const elapsedMs = Math.max(0, nowMs - state.updatedAtMs) + Math.max(0, oneWayLatencyMs);
    projected = base + (elapsedMs / 1000) * rate;
  }
  if (state.track.duration && state.track.duration > 0) {
    return Math.min(state.track.duration, Math.max(0, projected));
  }
  return Math.max(0, projected);
}

/**
 * Computes the minimal set of actions (`loadTrack`, `seekTo`, `targetStatus`) required
 * to bring a listener cleanly into sync with the host without unnecessary seek jitter.
 */
export function reconcileListenerPlayback(
  remote: BroadcastSyncState,
  local: LocalPlaybackSnapshot,
  options: { nowMs?: number; oneWayLatencyMs?: number; driftToleranceSeconds?: number } = {},
): SyncReconciliationPlan {
  const tolerance = options.driftToleranceSeconds ?? DEFAULT_DRIFT_TOLERANCE_SECONDS;
  const expectedPosition = estimateRemotePosition(
    remote,
    options.nowMs ?? Date.now(),
    options.oneWayLatencyMs ?? 0,
  );

  if (remote.status === 'stopped' || !remote.track) {
    return {
      loadTrack: null,
      seekTo: null,
      targetStatus: 'stopped',
      expectedPosition: 0,
      driftSeconds: 0,
    };
  }

  const sameTrack =
    local.trackId === remote.track.id ||
    (Boolean(local.trackSrc) && local.trackSrc === remote.track.streamUrl);

  const localPos = Number.isFinite(local.currentTime) && local.currentTime >= 0 ? local.currentTime : 0;
  const driftSeconds = expectedPosition - localPos;

  if (!sameTrack) {
    return {
      loadTrack: remote.track,
      seekTo: expectedPosition > 0.25 ? expectedPosition : null,
      targetStatus: remote.status,
      expectedPosition,
      driftSeconds,
    };
  }

  const needsSeek = Math.abs(driftSeconds) > tolerance;
  return {
    loadTrack: null,
    seekTo: needsSeek ? expectedPosition : null,
    targetStatus: remote.status,
    expectedPosition,
    driftSeconds,
  };
}

/** Serializes a Server-Sent Events (SSE) frame. */
export function formatSseEvent(event: string, payload: unknown, id?: string | number): string {
  const lines: string[] = [];
  if (id !== undefined) lines.push(`id: ${String(id)}`);
  if (event) lines.push(`event: ${event}`);
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const dataLine of data.split(/\r?\n/)) {
    lines.push(`data: ${dataLine}`);
  }
  return `${lines.join('\n')}\n\n`;
}

/** Incrementally parses SSE chunks and returns parsed events plus any incomplete trailing buffer. */
export function parseSseChunk(rawBuffer: string): { events: ParsedSseEvent[]; remainder: string } {
  const normalized = rawBuffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';
  const events: ParsedSseEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    let id: string | undefined;
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colonIdx = line.indexOf(':');
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
      let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') event = value || 'message';
      else if (field === 'id') id = value;
      else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length > 0) {
      events.push({ event, id, data: dataLines.join('\n') });
    }
  }

  return { events, remainder };
}

/** Tracks live host session state, token validation, sequence numbers, and connected listeners. */
export class BroadcastHostStateManager {
  readonly sessionId: string;
  private token: string;
  private state: BroadcastSyncState;
  private readonly listeners = new Set<string>();
  private readonly subscribers = new Set<(state: BroadcastSyncState) => void>();

  constructor(options: { sessionId?: string; token?: string; nowMs?: number } = {}) {
    this.sessionId = options.sessionId || `party-${generateBroadcastToken(6)}`;
    this.token = options.token || generateBroadcastToken(16);
    this.state = {
      sessionId: this.sessionId,
      status: 'stopped',
      track: null,
      positionSeconds: 0,
      playbackRate: 1,
      updatedAtMs: options.nowMs ?? Date.now(),
      listenerCount: 0,
      sequence: 0,
    };
  }

  getToken(): string {
    return this.token;
  }

  rotateToken(): string {
    this.token = generateBroadcastToken(16);
    return this.token;
  }

  validateToken(candidate: string | undefined): boolean {
    if (!isValidSessionTokenFormat(candidate)) return false;
    return constantTimeTokenEqual(candidate.trim(), this.token);
  }

  getState(): BroadcastSyncState {
    return {
      ...this.state,
      track: this.state.track ? { ...this.state.track } : null,
    };
  }

  subscribe(listener: (state: BroadcastSyncState) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private emit(): BroadcastSyncState {
    const snap = this.getState();
    for (const sub of this.subscribers) {
      sub(snap);
    }
    return snap;
  }

  addListener(listenerId: string, providedToken: string): boolean {
    if (!this.validateToken(providedToken)) {
      return false;
    }
    this.listeners.add(listenerId);
    this.state = {
      ...this.state,
      listenerCount: this.listeners.size,
      sequence: this.state.sequence + 1,
    };
    this.emit();
    return true;
  }

  removeListener(listenerId: string): void {
    if (this.listeners.delete(listenerId)) {
      this.state = {
        ...this.state,
        listenerCount: this.listeners.size,
        sequence: this.state.sequence + 1,
      };
      this.emit();
    }
  }

  getListenerCount(): number {
    return this.listeners.size;
  }

  updateFromHost(
    patch: {
      status?: 'playing' | 'paused' | 'stopped';
      track?: BroadcastTrackMeta | Track | null;
      positionSeconds?: number;
      playbackRate?: number;
    },
    nowMs: number = Date.now(),
  ): BroadcastSyncState {
    let nextTrack = this.state.track;
    if (patch.track !== undefined) {
      if (patch.track === null) {
        nextTrack = null;
      } else if ('streamUrl' in patch.track) {
        nextTrack = patch.track;
      } else {
        nextTrack = {
          id: patch.track.id,
          title: patch.track.title,
          artist: patch.track.artist,
          album: patch.track.album,
          streamUrl: patch.track.src,
          duration: patch.track.duration,
          format: patch.track.format,
        };
      }
    }

    this.state = {
      ...this.state,
      status: patch.status ?? this.state.status,
      track: nextTrack,
      positionSeconds:
        patch.positionSeconds !== undefined && Number.isFinite(patch.positionSeconds)
          ? Math.max(0, patch.positionSeconds)
          : this.state.positionSeconds,
      playbackRate:
        patch.playbackRate !== undefined && Number.isFinite(patch.playbackRate) && patch.playbackRate > 0
          ? patch.playbackRate
          : this.state.playbackRate,
      updatedAtMs: nowMs,
      sequence: this.state.sequence + 1,
    };
    return this.emit();
  }

  toSseFrame(): string {
    return formatSseEvent('sync', this.getState(), this.state.sequence);
  }
}

/** Subscribes to a host SSE broadcast stream and reconciles local playback with latency compensation. */
export class SseBroadcastListener {
  private readonly hooks: ListenerPlaybackHooks;
  private readonly createEventSource: (url: string) => SseEventSourceLike;
  private readonly driftToleranceSeconds: number;
  private eventSource: SseEventSourceLike | null = null;
  private oneWayLatencyMs = 0;
  private lastRemoteState: BroadcastSyncState | null = null;
  private connected = false;
  private closed = false;
  private onUpdateCb?: (state: BroadcastSyncState, plan: SyncReconciliationPlan) => void;

  constructor(
    hooks: ListenerPlaybackHooks,
    options: {
      createEventSource?: (url: string) => SseEventSourceLike;
      driftToleranceSeconds?: number;
      onUpdate?: (state: BroadcastSyncState, plan: SyncReconciliationPlan) => void;
    } = {},
  ) {
    this.hooks = hooks;
    this.driftToleranceSeconds = options.driftToleranceSeconds ?? DEFAULT_DRIFT_TOLERANCE_SECONDS;
    this.onUpdateCb = options.onUpdate;
    this.createEventSource =
      options.createEventSource ??
      ((url: string) => {
        if (typeof EventSource === 'undefined') {
          throw new Error('EventSource is not available in this environment.');
        }
        return new EventSource(url) as unknown as SseEventSourceLike;
      });
  }

  setOneWayLatencyMs(ms: number): void {
    this.oneWayLatencyMs = Number.isFinite(ms) && ms >= 0 ? ms : 0;
  }

  getOneWayLatencyMs(): number {
    return this.oneWayLatencyMs;
  }

  isConnected(): boolean {
    return this.connected && !this.closed;
  }

  getLastState(): BroadcastSyncState | null {
    return this.lastRemoteState;
  }

  /** Connects to `<baseUrl>/api/broadcast/events?token=<token>` after validating URL & token syntax. */
  connect(baseUrl: string, sessionToken: string): string {
    if (!/^https?:\/\/\S+/i.test(baseUrl.trim())) {
      throw new Error('Invalid broadcast host URL (must start with http:// or https://).');
    }
    if (!isValidSessionTokenFormat(sessionToken)) {
      throw new Error('Invalid session token (expected 8..128 safe characters).');
    }

    this.close();
    this.closed = false;

    const cleanBase = baseUrl.trim().replace(/\/+$/, '');
    const sseUrl = `${cleanBase}/api/broadcast/events?token=${encodeURIComponent(sessionToken.trim())}`;
    const es = this.createEventSource(sseUrl);
    this.eventSource = es;

    const handleRawData = (raw: string) => {
      if (this.closed) return;
      try {
        const parsed = JSON.parse(raw) as BroadcastSyncState;
        if (parsed && typeof parsed.status === 'string') {
          void this.applyRemoteState(parsed);
        }
      } catch {
        // Ignore malformed keepalive or non-JSON frames.
      }
    };

    es.onopen = () => {
      if (!this.closed) {
        this.connected = true;
      }
    };
    es.onmessage = ev => handleRawData(ev.data);
    es.addEventListener?.('sync', ev => handleRawData(ev.data));
    es.onerror = () => {
      this.connected = false;
    };

    return sseUrl;
  }

  /** Applies a received `BroadcastSyncState` snapshot to local playback hooks. */
  async applyRemoteState(remote: BroadcastSyncState, nowMs: number = Date.now()): Promise<SyncReconciliationPlan> {
    this.lastRemoteState = remote;
    const local = this.hooks.getLocalState();
    const plan = reconcileListenerPlayback(remote, local, {
      nowMs,
      oneWayLatencyMs: this.oneWayLatencyMs,
      driftToleranceSeconds: this.driftToleranceSeconds,
    });

    if (plan.loadTrack) {
      await this.hooks.loadTrack(plan.loadTrack);
    }
    if (plan.seekTo !== null) {
      await this.hooks.seek(plan.seekTo);
    }
    if (plan.targetStatus === 'stopped') {
      if (local.status !== 'stopped') await this.hooks.stop();
    } else if (plan.targetStatus === 'paused') {
      if (local.status !== 'paused') await this.hooks.pause();
    } else if (plan.targetStatus === 'playing') {
      if (local.status !== 'playing' || plan.loadTrack) await this.hooks.play();
    }

    this.onUpdateCb?.(remote, plan);
    return plan;
  }

  /** Cleanly closes the SSE stream and clears handlers to prevent leaks. */
  close(): void {
    this.closed = true;
    this.connected = false;
    if (this.eventSource) {
      this.eventSource.onopen = null;
      this.eventSource.onmessage = null;
      this.eventSource.onerror = null;
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
