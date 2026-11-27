/**
 * Optional Icecast 2.4+ HTTP PUT audio source pusher configuration & controller.
 * Encodes standard Icecast source headers (`Authorization: Basic ...`, `Ice-*`) and streams
 * captured audio chunks cleanly with deterministic shutdown.
 */

export const ICECAST_DEFAULT_MIME = 'audio/ogg; codecs=opus';

export interface IcecastPushConfig {
  serverUrl: string;
  mountpoint: string;
  username?: string;
  password: string;
  streamName?: string;
  genre?: string;
  bitrateKbps?: number;
  mimeType?: string;
  isPublic?: boolean;
}

export interface IcecastValidationResult {
  valid: boolean;
  targetUrl?: string;
  errors: string[];
}

export type IcecastFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

function toBase64Ascii(input: string): string {
  if (typeof btoa === 'function') {
    return btoa(input);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += chars[(triple >> 18) & 63];
    out += chars[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[triple & 63] : '=';
  }
  return out;
}

/** Validates Icecast server URL, mountpoint, credentials, and bitrate. */
export function validateIcecastConfig(config: IcecastPushConfig): IcecastValidationResult {
  const errors: string[] = [];
  const rawUrl = (config.serverUrl || '').trim();
  let normalizedOrigin = '';

  if (!/^https?:\/\/\S+/i.test(rawUrl)) {
    errors.push('Icecast server URL must start with http:// or https://');
  } else {
    try {
      const parsed = new URL(rawUrl);
      normalizedOrigin = parsed.origin;
    } catch {
      errors.push('Icecast server URL is malformed');
    }
  }

  const mount = (config.mountpoint || '').trim();
  if (!mount || !mount.startsWith('/') || /\s|\.\./.test(mount)) {
    errors.push('Icecast mountpoint must start with "/" and contain no spaces or ".."');
  }

  if (!config.password || !config.password.trim()) {
    errors.push('Icecast source password is required');
  }

  if (config.bitrateKbps !== undefined && (config.bitrateKbps < 32 || config.bitrateKbps > 512)) {
    errors.push('Bitrate must be between 32 and 512 kbps');
  }

  return {
    valid: errors.length === 0,
    targetUrl: errors.length === 0 ? `${normalizedOrigin}${mount}` : undefined,
    errors,
  };
}

/** Builds HTTP headers for an Icecast 2.4+ HTTP `PUT` source stream. */
export function buildIcecastSourceHeaders(config: IcecastPushConfig): Record<string, string> {
  const user = (config.username || 'source').trim() || 'source';
  const auth = `Basic ${toBase64Ascii(`${user}:${config.password}`)}`;
  const headers: Record<string, string> = {
    Authorization: auth,
    'Content-Type': config.mimeType || ICECAST_DEFAULT_MIME,
    'Ice-Public': config.isPublic ? '1' : '0',
    'Ice-Name': (config.streamName || 'mPlay3r Live').trim(),
  };
  if (config.genre?.trim()) {
    headers['Ice-Genre'] = config.genre.trim();
  }
  if (config.bitrateKbps && Number.isFinite(config.bitrateKbps)) {
    headers['Ice-Bitrate'] = String(Math.round(config.bitrateKbps));
  }
  return headers;
}

/** Manages an optional Icecast 2.4+ push session with clean AbortController teardown. */
export class IcecastPushController {
  private readonly fetcher: IcecastFetcher;
  private abortController: AbortController | null = null;
  private activeTargetUrl: string | null = null;
  private bytesSent = 0;

  constructor(fetcher: IcecastFetcher) {
    this.fetcher = fetcher;
  }

  isStreaming(): boolean {
    return this.activeTargetUrl !== null;
  }

  getStatus(): { streaming: boolean; targetUrl: string | null; bytesSent: number } {
    return {
      streaming: this.activeTargetUrl !== null,
      targetUrl: this.activeTargetUrl,
      bytesSent: this.bytesSent,
    };
  }

  /** Pushes an audio chunk or stream to an Icecast 2.4+ mountpoint via HTTP PUT. */
  async start(config: IcecastPushConfig, body: BodyInit): Promise<{ targetUrl: string }> {
    const check = validateIcecastConfig(config);
    if (!check.valid || !check.targetUrl) {
      throw new Error(check.errors.join('; '));
    }

    this.stop();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.abortController = controller;
    this.activeTargetUrl = check.targetUrl;

    const headers = buildIcecastSourceHeaders(config);
    const res = await this.fetcher(check.targetUrl, {
      method: 'PUT',
      headers,
      body,
      signal: controller?.signal,
    });

    if (!res.ok) {
      this.stop();
      throw new Error(`Icecast rejected source stream (HTTP ${res.status})`);
    }
    if (body instanceof Uint8Array) {
      this.bytesSent += body.byteLength;
    } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
      this.bytesSent += body.size;
    }
    return { targetUrl: check.targetUrl };
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.activeTargetUrl = null;
  }
}
