import type { PluginStorage } from '../../../sdk/types';
import {
  buildShareConnectionUrl,
  formatLanCompanionCommand,
  generateBearerToken,
  generateLanPin,
} from './protocol';
import type { LanShareServerConfig, LanShareServerStatus } from './protocol';
import { renderQrCodeSvg } from './qrcode';

export interface LanHostBridge {
  isSupported(): boolean;
  startServer(config: LanShareServerConfig): Promise<{ url: string }>;
  stopServer(): Promise<void>;
  pickFolder?(): Promise<string | null>;
}

interface TauriLikeGlobals {
  __TAURI_INTERNALS__?: {
    invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  __MPLAY3R_LAN_BRIDGE__?: LanHostBridge;
}

const HOST_CONFIG_STORAGE_KEY = 'lanHostConfig';

/** Detects an injected LAN bridge or Tauri Desktop runtime capable of spawning `mplay3r-lan-server`. */
export function createDefaultLanHostBridge(): LanHostBridge {
  const g = globalThis as unknown as TauriLikeGlobals;
  if (g.__MPLAY3R_LAN_BRIDGE__) {
    return g.__MPLAY3R_LAN_BRIDGE__;
  }

  const invoke = g.__TAURI_INTERNALS__?.invoke;
  return {
    isSupported(): boolean {
      return typeof invoke === 'function';
    },
    async startServer(config: LanShareServerConfig): Promise<{ url: string }> {
      if (typeof invoke !== 'function') {
        throw new Error(
          'Local LAN TCP server requires mPlay3r Desktop or the standalone `mplay3r-lan-server` companion binary.',
        );
      }
      const result = await invoke<{ url?: string }>('start_lan_share_server', { config });
      return { url: result?.url || `http://127.0.0.1:${config.port}` };
    },
    async stopServer(): Promise<void> {
      if (typeof invoke === 'function') {
        await invoke('stop_lan_share_server');
      }
    },
  };
}

/**
 * Controls the local LAN library share server configuration, explicit folder allowlist,
 * PIN/Bearer credential rotation, start/stop lifecycle, and QR code generation.
 */
export class LanHostController {
  private readonly storage: PluginStorage;
  private readonly bridge: LanHostBridge;
  private config: LanShareServerConfig;
  private running = false;
  private activeUrl: string | undefined;
  private lastError: string | undefined;

  constructor(storage: PluginStorage, bridge: LanHostBridge = createDefaultLanHostBridge()) {
    this.storage = storage;
    this.bridge = bridge;
    this.config = {
      serverName: 'mPlay3r LAN Library',
      port: 8765,
      bindAddress: '0.0.0.0',
      sharedFolders: [],
      pin: generateLanPin(6),
      bearerToken: generateBearerToken(24),
    };
  }

  async load(): Promise<LanShareServerStatus> {
    const saved = await this.storage.get<Partial<LanShareServerConfig>>(HOST_CONFIG_STORAGE_KEY);
    if (saved && typeof saved === 'object') {
      if (typeof saved.serverName === 'string' && saved.serverName.trim()) {
        this.config.serverName = saved.serverName.trim();
      }
      if (typeof saved.port === 'number' && saved.port >= 1024 && saved.port <= 65535) {
        this.config.port = Math.floor(saved.port);
      }
      if (Array.isArray(saved.sharedFolders)) {
        this.config.sharedFolders = saved.sharedFolders.filter(
          (f): f is string => typeof f === 'string' && f.trim().length > 0,
        );
      }
      if (typeof saved.pin === 'string' && /^\d{4,12}$/.test(saved.pin)) {
        this.config.pin = saved.pin;
      }
      if (typeof saved.bearerToken === 'string' && saved.bearerToken.length >= 16) {
        this.config.bearerToken = saved.bearerToken;
      }
    }
    return this.getStatus();
  }

  private async persist(): Promise<void> {
    await this.storage.set(HOST_CONFIG_STORAGE_KEY, this.config);
  }

  getStatus(): LanShareServerStatus {
    return {
      running: this.running,
      supported: this.bridge.isSupported(),
      url: this.activeUrl,
      serverName: this.config.serverName,
      port: this.config.port,
      sharedFolders: [...this.config.sharedFolders],
      pin: this.config.pin,
      bearerToken: this.config.bearerToken,
      cliCommand: formatLanCompanionCommand(this.config),
      error: this.lastError,
    };
  }

  async updateSettings(patch: { serverName?: string; port?: number }): Promise<LanShareServerStatus> {
    if (typeof patch.serverName === 'string' && patch.serverName.trim()) {
      this.config.serverName = patch.serverName.trim().slice(0, 64);
    }
    if (typeof patch.port === 'number' && Number.isFinite(patch.port)) {
      this.config.port = Math.min(65535, Math.max(1024, Math.floor(patch.port)));
    }
    await this.persist();
    return this.getStatus();
  }

  async addSharedFolder(folderPath: string): Promise<LanShareServerStatus> {
    const clean = folderPath.trim();
    if (!clean || clean.includes('\0') || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(clean)) {
      throw new Error('Invalid folder path (relative traversal segments are not permitted).');
    }
    if (!this.config.sharedFolders.includes(clean)) {
      this.config.sharedFolders.push(clean);
      await this.persist();
    }
    return this.getStatus();
  }

  async removeSharedFolder(folderPath: string): Promise<LanShareServerStatus> {
    this.config.sharedFolders = this.config.sharedFolders.filter(f => f !== folderPath);
    await this.persist();
    return this.getStatus();
  }

  async rotateCredentials(): Promise<LanShareServerStatus> {
    this.config.pin = generateLanPin(6);
    this.config.bearerToken = generateBearerToken(24);
    await this.persist();
    return this.getStatus();
  }

  async start(): Promise<LanShareServerStatus> {
    if (this.config.sharedFolders.length === 0) {
      this.lastError = 'Select at least one local music folder before starting LAN sharing.';
      throw new Error(this.lastError);
    }
    this.lastError = undefined;
    try {
      const started = await this.bridge.startServer({ ...this.config, sharedFolders: [...this.config.sharedFolders] });
      this.running = true;
      this.activeUrl = started.url;
      return this.getStatus();
    } catch (err) {
      this.running = false;
      this.activeUrl = undefined;
      this.lastError = err instanceof Error ? err.message : 'Unable to start LAN server.';
      throw err;
    }
  }

  async stop(): Promise<LanShareServerStatus> {
    try {
      await this.bridge.stopServer();
    } finally {
      this.running = false;
      this.activeUrl = undefined;
      this.lastError = undefined;
    }
    return this.getStatus();
  }

  /** Builds the quick-connect URL + scannable SVG QR code for LAN devices. */
  getPairingQr(overrideBaseUrl?: string): { connectUrl: string; svg: string } {
    const base = overrideBaseUrl || this.activeUrl || `http://localhost:${this.config.port}`;
    const connectUrl = buildShareConnectionUrl(base, { pin: this.config.pin });
    return {
      connectUrl,
      svg: renderQrCodeSvg(connectUrl, { pixelSize: 156 }),
    };
  }
}
