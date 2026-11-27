/**
 * Shared LAN Library Share protocol contracts, sanitization, and PIN/Bearer helpers.
 */

export type LanConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SharedServerInfo {
  name: string;
  version: string;
  authRequired: boolean;
  folderCount: number;
  trackCount: number;
}

export interface SharedTrack {
  id: string;
  title: string;
  folder: string;
  format: string;
  sizeBytes: number;
}

export interface SharedPlaylist {
  id: string;
  name: string;
  folder: string;
  trackCount: number;
  tracks: SharedTrack[];
}

export interface LibraryPage {
  serverName: string;
  folder: string;
  query: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  folders: string[];
  tracks: SharedTrack[];
}

export interface SavedLanServer {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  lastConnectedAt: string;
}

export interface LanShareServerConfig {
  serverName: string;
  port: number;
  bindAddress: string;
  sharedFolders: string[];
  pin: string;
  bearerToken: string;
}

export interface LanShareServerStatus {
  running: boolean;
  supported: boolean;
  url?: string;
  serverName: string;
  port: number;
  sharedFolders: string[];
  pin: string;
  bearerToken: string;
  cliCommand?: string;
  error?: string;
}

/** Validates and normalizes an HTTP(S) LAN server base URL (strips trailing slash & query/hash). */
export function normalizeServerBaseUrl(raw: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return null;
  }
  const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:\/|$))/i.test(trimmed);
  const withScheme = hasExplicitScheme ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return null;
  }
}

/** Validates a relative folder filter string and blocks path traversal tokens. */
export function sanitizeRelativeFolder(folder: string): string | null {
  const trimmed = (folder || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('\0') || trimmed.includes('\\') || /(?:^|\/)\.\.(?:\/|$)/.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/^\/+|\/+$/g, '');
}

/** Checks whether a LAN PIN contains 4 to 12 digits. */
export function isValidLanPin(pin: string): boolean {
  return /^\d{4,12}$/.test((pin || '').trim());
}

function getCryptoRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

/** Generates a random numeric LAN pairing PIN (default 6 digits). */
export function generateLanPin(digits = 6): string {
  const len = Math.min(12, Math.max(4, Math.floor(digits)));
  const bytes = getCryptoRandomBytes(len);
  let pin = '';
  for (let i = 0; i < len; i += 1) {
    pin += String(bytes[i] % 10);
  }
  return pin;
}

/** Generates a random hex Bearer token (default 24 bytes = 48 hex chars). */
export function generateBearerToken(byteLength = 24): string {
  const bytes = getCryptoRandomBytes(Math.max(16, byteLength));
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Builds a quick-connect URL (for QR code scanning on phones/laptops on the same LAN). */
export function buildShareConnectionUrl(baseUrl: string, options: { pin?: string; token?: string } = {}): string {
  const clean = normalizeServerBaseUrl(baseUrl) ?? baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (options.token) {
    params.set('token', options.token);
  } else if (options.pin) {
    params.set('pin', options.pin);
  }
  const qs = params.toString();
  return qs ? `${clean}/?${qs}` : `${clean}/`;
}

/** Formats a ready-to-run companion CLI command for `mplay3r-lan-server`. */
export function formatLanCompanionCommand(config: LanShareServerConfig): string {
  const quote = (val: string) => `"${val.replace(/"/g, '\\"')}"`;
  const dirs =
    config.sharedFolders.length > 0
      ? config.sharedFolders.map(dir => `--dir ${quote(dir)}`).join(' ')
      : '--dir "/path/to/Music"';
  return `mplay3r-lan-server ${dirs} --port ${config.port} --name ${quote(config.serverName)} --pin ${config.pin}`;
}
