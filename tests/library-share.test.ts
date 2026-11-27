import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createLanClientMediaSourceProvider,
  RemoteLibraryClient,
  RemoteLibraryError,
  SavedServersStore,
} from '../plugins/library-share/src/client';
import { LanHostController } from '../plugins/library-share/src/host-bridge';
import type { LanHostBridge } from '../plugins/library-share/src/host-bridge';
import librarySharePlugin from '../plugins/library-share/src/index';
import {
  buildShareConnectionUrl,
  formatLanCompanionCommand,
  generateBearerToken,
  generateLanPin,
  isValidLanPin,
  normalizeServerBaseUrl,
  sanitizeRelativeFolder,
} from '../plugins/library-share/src/protocol';
import { encodeQrMatrix, renderQrCodeSvg } from '../plugins/library-share/src/qrcode';
import type { MediaSourceProvider, PluginContext, PluginSlotDescriptor, PluginStorage } from '../sdk/types';

function createMemoryStorage(): PluginStorage {
  const map = new Map<string, string>();
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = map.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T): Promise<void> {
      map.set(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
    async clear(): Promise<void> {
      map.clear();
    },
  };
}

describe('PR #11 — Plugin mplay3r.library-share (Local LAN Library Share & Remote Client)', () => {
  describe('Protocol helpers, URL/folder sanitization & QR Code SVG', () => {
    it('normalizes LAN URLs, rejects traversal paths, and generates cryptographic PIN/Bearer secrets', () => {
      assert.equal(normalizeServerBaseUrl('192.168.1.42:8765/'), 'http://192.168.1.42:8765');
      assert.equal(normalizeServerBaseUrl('music.lan:8765'), 'http://music.lan:8765');
      assert.equal(normalizeServerBaseUrl('https://music.lan/api/'), 'https://music.lan/api');
      assert.equal(normalizeServerBaseUrl('javascript:alert(1)'), null);
      assert.equal(normalizeServerBaseUrl('ftp://192.168.1.10'), null);
      assert.equal(normalizeServerBaseUrl('file:///etc/passwd'), null);

      assert.equal(sanitizeRelativeFolder('/Rock/2026/'), 'Rock/2026');
      assert.equal(sanitizeRelativeFolder(''), '');
      assert.equal(sanitizeRelativeFolder('../etc/passwd'), null);
      assert.equal(sanitizeRelativeFolder('Rock/../../secret'), null);
      assert.equal(sanitizeRelativeFolder('Rock\\Album'), null);

      const pin = generateLanPin(6);
      assert.equal(isValidLanPin(pin), true);
      assert.equal(pin.length, 6);
      assert.equal(isValidLanPin('12ab'), false);

      const tok = generateBearerToken(24);
      assert.match(tok, /^[0-9a-f]{48}$/);

      assert.equal(
        buildShareConnectionUrl('http://192.168.1.42:8765/', { pin: '482910' }),
        'http://192.168.1.42:8765/?pin=482910',
      );
    });

    it('encodes valid ISO/IEC 18004 QR matrices (V1, V2, V3, V6) and renders a crisp single-path SVG', () => {
      const v1 = encodeQrMatrix('http://a.lan');
      assert.equal(v1.version, 1);
      assert.equal(v1.size, 21);

      const v2 = encodeQrMatrix('http://192.168.1.42:8765/');
      assert.equal(v2.version, 2);
      assert.equal(v2.size, 25);

      const url = 'http://192.168.1.42:8765/?pin=482910';
      const qr = encodeQrMatrix(url);
      assert.equal(qr.version, 3);
      assert.equal(qr.size, 29);

      // Verify top-left 7x7 finder pattern outer ring + center 3x3 dark square
      for (let i = 0; i < 7; i += 1) {
        assert.equal(qr.modules[0][i], true);
        assert.equal(qr.modules[6][i], true);
        assert.equal(qr.modules[i][0], true);
        assert.equal(qr.modules[i][6], true);
      }
      assert.equal(qr.modules[3][3], true);
      assert.equal(qr.modules[1][1], false);
      // Fixed dark module at (4*version + 9, 8)
      assert.equal(qr.modules[4 * qr.version + 9][8], true);

      // Multi-block Version 6 (up to 134 bytes)
      const v6 = encodeQrMatrix('http://192.168.1.42:8765/?token=' + 'a'.repeat(85));
      assert.equal(v6.version, 6);
      assert.equal(v6.size, 41);

      const svg = renderQrCodeSvg(url, { pixelSize: 160 });
      assert.ok(svg.startsWith('<svg '));
      assert.ok(svg.includes('viewBox="0 0 37 37"'));
      assert.ok(svg.includes('<path d="M'));

      assert.throws(() => encodeQrMatrix('x'.repeat(200)), /too long/);
    });
  });

  describe('Remote LAN client: auth, folder browsing, pagination, playlists & disconnect recovery', () => {
    it('authenticates via PIN, browses folders/search/pagination, lists playlists, and recovers from connection drops', async () => {
      let serverOnline = true;
      let tokenRevoked = false;
      const allTracks = [
        { id: 't1', title: 'Around The World', folder: 'Electro', format: 'FLAC', sizeBytes: 25_000_000 },
        { id: 't2', title: 'Aerodynamic', folder: 'Electro', format: 'MP3', sizeBytes: 7_500_000 },
        { id: 't3', title: 'So What', folder: 'Jazz', format: 'FLAC', sizeBytes: 31_000_000 },
      ];

      const mockFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
        if (!serverOnline) {
          throw new Error('ECONNREFUSED: LAN host unreachable');
        }
        const parsed = new URL(String(input));

        if (parsed.pathname === '/api/info') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              name: 'Living Room PC',
              version: '1.0.0',
              authRequired: true,
              folderCount: 2,
              trackCount: allTracks.length,
            }),
          } as unknown as Response;
        }

        if (parsed.pathname === '/api/auth') {
          const body = JSON.parse(String(init?.body || '{}')) as { pin?: string };
          if (body.pin === '482910') {
            return {
              ok: true,
              status: 200,
              json: async () => ({ token: 'valid-lan-token', name: 'Living Room PC' }),
            } as unknown as Response;
          }
          return { ok: false, status: 401, json: async () => ({ error: 'Invalid PIN' }) } as unknown as Response;
        }

        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (tokenRevoked || headers.Authorization !== 'Bearer valid-lan-token') {
          return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as unknown as Response;
        }

        if (parsed.pathname === '/api/library') {
          const folder = parsed.searchParams.get('folder') || '';
          const q = (parsed.searchParams.get('q') || '').toLowerCase();
          const page = Number(parsed.searchParams.get('page') || '1');
          const limit = Number(parsed.searchParams.get('limit') || '50');
          const filtered = allTracks.filter(t => {
            if (folder && t.folder !== folder) return false;
            if (q && !t.title.toLowerCase().includes(q) && !t.folder.toLowerCase().includes(q)) return false;
            return true;
          });
          const offset = (page - 1) * limit;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              serverName: 'Living Room PC',
              folder,
              query: q,
              page,
              limit,
              total: filtered.length,
              totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
              folders: ['Electro', 'Jazz'],
              tracks: filtered.slice(offset, offset + limit),
            }),
          } as unknown as Response;
        }

        if (parsed.pathname === '/api/playlists') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              playlists: [
                { id: 'pl-1', name: 'Night Mix', folder: 'Electro', trackCount: 2, tracks: allTracks.slice(0, 2) },
              ],
            }),
          } as unknown as Response;
        }

        return { ok: false, status: 404 } as unknown as Response;
      };

      const client = new RemoteLibraryClient(mockFetch);

      // Invalid PIN rejects with unauthorized RemoteLibraryError
      await assert.rejects(
        () => client.connect({ baseUrl: '192.168.1.50:8765', pin: '000000' }),
        (err: unknown) => err instanceof RemoteLibraryError && err.code === 'unauthorized' && err.status === 401,
      );

      // Valid PIN connects cleanly
      const connected = await client.connect({ baseUrl: '192.168.1.50:8765', pin: '482910' });
      assert.equal(connected.info.name, 'Living Room PC');
      assert.equal(connected.token, 'valid-lan-token');
      assert.equal(client.getSnapshot().state, 'connected');

      // Folder filter + pagination
      const page1 = await client.listLibrary({ folder: 'Electro', page: 1, limit: 1 });
      assert.equal(page1.total, 2);
      assert.equal(page1.totalPages, 2);
      assert.equal(page1.tracks.length, 1);
      assert.equal(page1.tracks[0].title, 'Around The World');

      const page2 = await client.listLibrary({ folder: 'Electro', page: 2, limit: 1 });
      assert.equal(page2.tracks[0].title, 'Aerodynamic');

      // Search & client-side path traversal rejection
      const jazz = await client.listLibrary({ query: 'what' });
      assert.equal(jazz.tracks.length, 1);
      assert.equal(jazz.tracks[0].id, 't3');
      await assert.rejects(
        () => client.listLibrary({ folder: '../private' }),
        (err: unknown) => err instanceof RemoteLibraryError && err.code === 'invalid-url',
      );

      // Playlists & authenticated stream URL + MediaSourceProvider
      const playlists = await client.listPlaylists();
      assert.equal(playlists.length, 1);
      assert.equal(playlists[0].name, 'Night Mix');
      assert.equal(
        client.getStreamUrl('t1'),
        'http://192.168.1.50:8765/api/stream/t1?token=valid-lan-token',
      );

      const provider = createLanClientMediaSourceProvider(client);
      const mediaHits = await provider.search('Aero');
      assert.equal(mediaHits.length, 1);
      assert.equal(mediaHits[0].streamUrl, 'http://192.168.1.50:8765/api/stream/t2?token=valid-lan-token');

      // Simulate LAN connection drop -> transitions to reconnecting -> recovers on ping()
      serverOnline = false;
      await assert.rejects(
        () => client.listLibrary(),
        (err: unknown) => err instanceof RemoteLibraryError && err.code === 'network',
      );
      assert.equal(client.getSnapshot().state, 'reconnecting');

      serverOnline = true;
      assert.equal(await client.ping(), true);
      assert.equal(client.getSnapshot().state, 'connected');

      // Simulate token revocation -> HTTP 401 moves state to error
      tokenRevoked = true;
      await assert.rejects(
        () => client.listLibrary(),
        (err: unknown) => err instanceof RemoteLibraryError && err.code === 'unauthorized',
      );
      assert.equal(client.getSnapshot().state, 'error');

      // SavedServersStore persistence
      const storage = createMemoryStorage();
      const saved = new SavedServersStore(storage);
      await saved.save({ baseUrl: 'http://192.168.1.50:8765/', name: 'Living Room PC', token: 'valid-lan-token' });
      const reloaded = new SavedServersStore(storage);
      await reloaded.load();
      assert.equal(reloaded.list().length, 1);
      assert.equal(reloaded.list()[0].baseUrl, 'http://192.168.1.50:8765');
    });
  });

  describe('Local LAN host controller, allowlist enforcement & plugin activation', () => {
    it('enforces non-empty folder allowlist, rotates credentials, generates QR & CLI command, and manages lifecycle', async () => {
      const storage = createMemoryStorage();
      let startedDirs: string[] = [];
      let stopped = false;

      const bridge: LanHostBridge = {
        isSupported: () => true,
        async startServer(cfg) {
          startedDirs = cfg.sharedFolders;
          return { url: `http://192.168.1.99:${cfg.port}` };
        },
        async stopServer() {
          stopped = true;
        },
      };

      const host = new LanHostController(storage, bridge);
      await host.load();

      // Cannot start with empty folder allowlist
      await assert.rejects(() => host.start(), /at least one local music folder/i);

      // Traversal paths rejected
      await assert.rejects(() => host.addSharedFolder('/home/user/../etc'), /traversal/i);

      await host.addSharedFolder('/home/user/Music');
      const prevPin = host.getStatus().pin;
      await host.updateSettings({ serverName: 'Studio Desktop', port: 9001 });
      const status = await host.start();
      assert.equal(status.running, true);
      assert.equal(status.url, 'http://192.168.1.99:9001');
      assert.deepEqual(startedDirs, ['/home/user/Music']);

      const qr = host.getPairingQr();
      assert.ok(qr.connectUrl.startsWith('http://192.168.1.99:9001/?pin='));
      assert.ok(qr.svg.includes('<svg '));

      const rotated = await host.rotateCredentials();
      assert.equal(isValidLanPin(rotated.pin), true);
      assert.notEqual(rotated.bearerToken, status.bearerToken);
      assert.ok(
        formatLanCompanionCommand({
          serverName: 'Studio Desktop',
          port: 9001,
          bindAddress: '0.0.0.0',
          sharedFolders: ['/home/user/Music'],
          pin: prevPin,
          bearerToken: status.bearerToken,
        }).includes('--dir "/home/user/Music"'),
      );

      await host.stop();
      assert.equal(stopped, true);
      assert.equal(host.getStatus().running, false);
    });

    it('activates mplay3r.library-share cleanly with LAN Share panel and MediaSourceProvider', async () => {
      const providers: MediaSourceProvider[] = [];
      const slots: PluginSlotDescriptor[] = [];

      const mockCtx = {
        manifest: librarySharePlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        playlist: {
          clearPlaylist: async () => undefined,
          addTracks: async () => [],
        },
        registerProvider: (_kind: 'media-source', provider: MediaSourceProvider) => {
          providers.push(provider);
          return () => undefined;
        },
        registerSlot: (slot: PluginSlotDescriptor) => {
          slots.push(slot);
          return () => undefined;
        },
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response,
        notify: async () => undefined,
      } as unknown as PluginContext;

      await librarySharePlugin.activate(mockCtx);
      assert.equal(providers.length, 1);
      assert.equal(providers[0].id, 'mplay3r-lan-client');
      assert.equal(slots.length, 1);
      assert.equal(slots[0].slot, 'panel');
      await librarySharePlugin.deactivate?.();
    });
  });
});
