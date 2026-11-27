import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildIcecastSourceHeaders,
  IcecastPushController,
  validateIcecastConfig,
} from '../plugins/live-broadcast/src/icecast';
import liveBroadcastPlugin from '../plugins/live-broadcast/src/index';
import {
  BroadcastHostStateManager,
  constantTimeTokenEqual,
  estimateRemotePosition,
  formatSseEvent,
  generateBroadcastToken,
  isValidSessionTokenFormat,
  parseSseChunk,
  reconcileListenerPlayback,
  SseBroadcastListener,
} from '../plugins/live-broadcast/src/sync';
import type { BroadcastSyncState, BroadcastTrackMeta, SseEventSourceLike } from '../plugins/live-broadcast/src/sync';
import {
  captureAudioContextStream,
  decodeSignalingPayload,
  encodeSignalingPayload,
  WebRtcBroadcastHost,
  WebRtcBroadcastListener,
} from '../plugins/live-broadcast/src/webrtc';
import type { MediaStreamLike, MediaTrackLike, PeerConnectionLike } from '../plugins/live-broadcast/src/webrtc';
import type { PluginContext, PluginSlotDescriptor, PluginStorage } from '../sdk/types';

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

describe('PR #12 — Plugin mplay3r.live-broadcast (Listening Party SSE, Icecast & WebRTC P2P)', () => {
  describe('Host/listener synchronization & latency drift compensation', () => {
    it('projects live position with latency compensation and reconciles play, pause, seek & track changes', () => {
      const trackA: BroadcastTrackMeta = {
        id: 'track-a',
        title: 'Digital Love',
        streamUrl: 'http://192.168.1.42:8765/api/stream/a?token=tok',
        duration: 300,
      };
      const trackB: BroadcastTrackMeta = {
        id: 'track-b',
        title: 'Voyager',
        streamUrl: 'http://192.168.1.42:8765/api/stream/b?token=tok',
        duration: 240,
      };

      const baseState: BroadcastSyncState = {
        sessionId: 'party-1',
        status: 'playing',
        track: trackA,
        positionSeconds: 40,
        playbackRate: 1,
        updatedAtMs: 10_000,
        listenerCount: 3,
        sequence: 1,
      };

      // 1500ms elapsed + 200ms one-way latency => 41.7s
      assert.ok(Math.abs(estimateRemotePosition(baseState, 11_500, 200) - 41.7) < 0.001);
      // Clamps to track duration
      assert.equal(estimateRemotePosition(baseState, 500_000, 0), 300);
      // Paused does not advance with elapsed time
      assert.equal(estimateRemotePosition({ ...baseState, status: 'paused' }, 20_000, 300), 40);

      // 1. Initial join on different track -> loadTrack + seek + play
      const joinPlan = reconcileListenerPlayback(
        baseState,
        { trackId: null, status: 'stopped', currentTime: 0 },
        { nowMs: 11_500, oneWayLatencyMs: 200 },
      );
      assert.equal(joinPlan.loadTrack?.id, 'track-a');
      assert.ok(joinPlan.seekTo !== null && Math.abs(joinPlan.seekTo - 41.7) < 0.01);
      assert.equal(joinPlan.targetStatus, 'playing');

      // 2. Small drift (0.3s <= 0.6s tolerance) -> no seek jitter
      const smallDrift = reconcileListenerPlayback(
        baseState,
        { trackId: 'track-a', status: 'playing', currentTime: 41.4 },
        { nowMs: 11_500, oneWayLatencyMs: 200 },
      );
      assert.equal(smallDrift.loadTrack, null);
      assert.equal(smallDrift.seekTo, null);

      // 3. Large host seek jump -> listener snaps to compensated position
      const seekPlan = reconcileListenerPlayback(
        { ...baseState, positionSeconds: 120, updatedAtMs: 12_000 },
        { trackId: 'track-a', status: 'playing', currentTime: 42 },
        { nowMs: 12_200, oneWayLatencyMs: 100 },
      );
      assert.equal(seekPlan.loadTrack, null);
      assert.ok(seekPlan.seekTo !== null && Math.abs(seekPlan.seekTo - 120.3) < 0.01);

      // 4. Track switch to trackB + pause
      const switchPlan = reconcileListenerPlayback(
        { ...baseState, track: trackB, status: 'paused', positionSeconds: 15, updatedAtMs: 13_000 },
        { trackId: 'track-a', status: 'playing', currentTime: 121 },
        { nowMs: 13_500 },
      );
      assert.equal(switchPlan.loadTrack?.id, 'track-b');
      assert.equal(switchPlan.targetStatus, 'paused');
      assert.equal(switchPlan.seekTo, 15);
    });
  });

  describe('Session token validation, SSE framing & SseBroadcastListener lifecycle', () => {
    it('validates session tokens, parses chunked SSE streams, reconciles playback, and closes cleanly', async () => {
      const tok = generateBroadcastToken(16);
      assert.equal(isValidSessionTokenFormat(tok), true);
      assert.equal(isValidSessionTokenFormat('short'), false);
      assert.equal(isValidSessionTokenFormat('bad token!'), false);
      assert.equal(constantTimeTokenEqual(tok, tok), true);
      assert.equal(constantTimeTokenEqual(tok, tok.slice(0, -1) + (tok.endsWith('0') ? '1' : '0')), false);

      const host = new BroadcastHostStateManager({ token: 'session-secret-token-01', nowMs: 1000 });
      assert.equal(host.addListener('bad-peer', 'wrong-token-value'), false);
      assert.equal(host.getListenerCount(), 0);
      assert.equal(host.addListener('peer-1', 'session-secret-token-01'), true);
      assert.equal(host.getListenerCount(), 1);

      const updated = host.updateFromHost(
        {
          status: 'playing',
          positionSeconds: 12,
          track: { id: 't1', title: 'Track One', streamUrl: 'http://lan/stream/t1' },
        },
        2000,
      );
      const sseFrame = host.toSseFrame();
      const half = Math.floor(sseFrame.length / 2);
      const part1 = parseSseChunk(`: keepalive\n\n${sseFrame.slice(0, half)}`);
      assert.equal(part1.events.length, 0);
      const part2 = parseSseChunk(part1.remainder + sseFrame.slice(half));
      assert.equal(part2.events.length, 1);
      assert.equal(part2.events[0].event, 'sync');
      assert.equal(JSON.parse(part2.events[0].data).sequence, updated.sequence);
      assert.ok(formatSseEvent('ping', 'ok', 9).includes('id: 9'));

      // Mock EventSource driving SseBroadcastListener
      let closedCount = 0;
      let syncHandler: ((ev: { data: string }) => void) | null = null;
      const mockEs: SseEventSourceLike = {
        onopen: null,
        onmessage: null,
        onerror: null,
        addEventListener(type, fn) {
          if (type === 'sync') syncHandler = fn;
        },
        close() {
          closedCount += 1;
        },
      };

      const actions: string[] = [];
      let localStatus: 'stopped' | 'playing' | 'paused' = 'stopped';
      let localTrackId: string | null = null;
      let localPos = 0;

      const listener = new SseBroadcastListener(
        {
          async loadTrack(t) {
            localTrackId = t.id;
            actions.push(`load:${t.id}`);
          },
          async play() {
            localStatus = 'playing';
            actions.push('play');
          },
          async pause() {
            localStatus = 'paused';
            actions.push('pause');
          },
          async stop() {
            localStatus = 'stopped';
            actions.push('stop');
          },
          async seek(sec) {
            localPos = sec;
            actions.push(`seek:${Math.round(sec)}`);
          },
          getLocalState: () => ({ trackId: localTrackId, status: localStatus, currentTime: localPos }),
        },
        { createEventSource: () => mockEs },
      );

      assert.throws(() => listener.connect('ftp://bad', 'session-secret-token-01'), /Invalid broadcast host URL/);
      assert.throws(() => listener.connect('http://192.168.1.42:8765', 'bad'), /Invalid session token/);

      const connectedUrl = listener.connect('http://192.168.1.42:8765/', 'session-secret-token-01');
      assert.equal(connectedUrl, 'http://192.168.1.42:8765/api/broadcast/events?token=session-secret-token-01');
      mockEs.onopen?.({});
      assert.equal(listener.isConnected(), true);
      assert.ok(syncHandler);

      listener.setOneWayLatencyMs(100);
      await listener.applyRemoteState(updated, 2000);
      assert.deepEqual(actions, ['load:t1', 'seek:12', 'play']);

      // Host pauses -> listener pauses
      await listener.applyRemoteState({ ...updated, status: 'paused', positionSeconds: 12.1 }, 2100);
      assert.equal(localStatus, 'paused');

      // Clean close tears down EventSource
      listener.close();
      assert.equal(closedCount, 1);
      assert.equal(listener.isConnected(), false);
    });
  });

  describe('Optional Icecast 2.4+ source push', () => {
    it('validates Icecast config, encodes Basic auth + Ice-* headers, and pushes / stops cleanly', async () => {
      const bad = validateIcecastConfig({ serverUrl: 'ftp://x', mountpoint: 'no-slash', password: '', bitrateKbps: 16 });
      assert.equal(bad.valid, false);
      assert.equal(bad.errors.length, 4);

      const validCfg = {
        serverUrl: 'http://icecast.local:8000',
        mountpoint: '/mplay3r.ogg',
        password: 'hackme',
        streamName: 'Studio Live',
        genre: 'Electronic',
        bitrateKbps: 192,
        isPublic: true,
      };
      const headers = buildIcecastSourceHeaders(validCfg);
      assert.equal(headers.Authorization, `Basic ${btoa('source:hackme')}`);
      assert.equal(headers['Ice-Public'], '1');
      assert.equal(headers['Ice-Bitrate'], '192');

      let methodUsed = '';
      const icecast = new IcecastPushController(async (_url, init) => {
        methodUsed = init?.method || '';
        return { ok: true, status: 200 } as unknown as Response;
      });
      const res = await icecast.start(validCfg, new Uint8Array([1, 2, 3, 4]));
      assert.equal(methodUsed, 'PUT');
      assert.equal(res.targetUrl, 'http://icecast.local:8000/mplay3r.ogg');
      assert.equal(icecast.getStatus().bytesSent, 4);
      icecast.stop();
      assert.equal(icecast.isStreaming(), false);
    });
  });

  describe('Web P2P WebRTC live audio capture, signaling & clean teardown', () => {
    it('captures Web Audio MediaStream, completes host/listener offer-answer with token guard, and closes cleanly', async () => {
      let trackStopped = 0;
      let tapDisconnected = 0;
      const fakeAudioTrack: MediaTrackLike = {
        kind: 'audio',
        stop() {
          trackStopped += 1;
        },
      };
      const fakeStream: MediaStreamLike = {
        getTracks: () => [fakeAudioTrack],
        getAudioTracks: () => [fakeAudioTrack],
      };
      const fakeDest = { stream: fakeStream } as unknown as { stream: MediaStreamLike } & AudioNode;
      const fakeAudioCtx = {
        createMediaStreamDestination: () => fakeDest,
      };
      let connectedDest: AudioNode | null = null;
      const fakeTapSource = {
        connect(dest: AudioNode) {
          connectedDest = dest;
        },
        disconnect() {
          tapDisconnected += 1;
        },
      };

      // Standalone captureAudioContextStream cleanup check
      const standaloneTap = captureAudioContextStream(fakeAudioCtx, fakeTapSource);
      assert.equal(connectedDest, fakeDest);
      standaloneTap.disconnect();
      assert.equal(tapDisconnected, 1);
      assert.equal(trackStopped, 1);

      // Full P2P WebRTC host <-> listener handshake with mock RTCPeerConnection
      const closedPcs: string[] = [];
      const makeMockPc = (label: string): PeerConnectionLike => {
        const pc: PeerConnectionLike = {
          localDescription: null,
          onicecandidate: null,
          onconnectionstatechange: null,
          oniceconnectionstatechange: null,
          ontrack: null,
          addTrack: () => ({}),
          async createOffer() {
            return { type: 'offer', sdp: 'v=0\r\no=host-offer' };
          },
          async createAnswer() {
            return { type: 'answer', sdp: 'v=0\r\no=listener-answer' };
          },
          async setLocalDescription(desc) {
            pc.localDescription = desc;
          },
          async setRemoteDescription() {
            // Simulate remote media track arriving once listener applies host offer
            if (label === 'listener') {
              pc.ontrack?.({ streams: [fakeStream] });
            }
          },
          close() {
            closedPcs.push(label);
          },
        };
        return pc;
      };

      const host = new WebRtcBroadcastHost({
        sessionId: 'rtc-room-1',
        token: 'webrtc-secret-token-99',
        hostName: 'DJ Alice',
        createPeerConnection: () => makeMockPc('host'),
      });
      host.startCapture(fakeAudioCtx, fakeTapSource);
      const { peerId, offerCode } = await host.createListenerOffer('listener-1');
      assert.equal(peerId, 'listener-1');
      assert.equal(host.getPeerCount(), 1);

      const decoded = decodeSignalingPayload(offerCode);
      assert.equal(decoded?.type, 'offer');
      assert.equal(decoded?.name, 'DJ Alice');

      // Listener rejects offer when expectedToken mismatches
      const listener = new WebRtcBroadcastListener({
        createPeerConnection: () => makeMockPc('listener'),
      });
      await assert.rejects(() => listener.joinWithOffer(offerCode, 'wrong-expected-token'), /token mismatch/i);

      // Listener joins cleanly & receives remote MediaStream
      const { answerCode, hostName } = await listener.joinWithOffer(offerCode, 'webrtc-secret-token-99');
      assert.equal(hostName, 'DJ Alice');
      assert.equal(listener.getRemoteStream(), fakeStream);

      // Host rejects tampered answer with invalid token
      const tamperedAnswer = encodeSignalingPayload({
        type: 'answer',
        sdp: 'v=0\r\no=bad',
        sessionId: 'rtc-room-1',
        token: 'tampered-token-1234',
        peerId: 'listener-1',
      });
      await assert.rejects(() => host.acceptListenerAnswer(tamperedAnswer), /token mismatch/i);

      // Host accepts genuine listener answer
      const accepted = await host.acceptListenerAnswer(answerCode);
      assert.equal(accepted.peerId, 'listener-1');

      // Clean shutdown closes both peer connections & disconnects audio tap
      listener.disconnect();
      host.stop();
      assert.deepEqual(closedPcs.sort(), ['host', 'listener']);
      assert.equal(host.isBroadcasting(), false);
      assert.equal(host.getPeerCount(), 0);
      assert.equal(tapDisconnected, 2);
      assert.ok(trackStopped >= 3);
    });
  });

  describe('Plugin activation & clean teardown', () => {
    it('registers broadcast-status-badge and live-broadcast-panel slots and cleans up on deactivate()', async () => {
      const slots: PluginSlotDescriptor[] = [];
      const mockCtx = {
        manifest: liveBroadcastPlugin.manifest,
        playerTarget: '#mplay3r',
        coreVersion: '0.1.0',
        storage: createMemoryStorage(),
        getState: () => ({ status: 'stopped', currentTrack: null, currentTime: 0 }),
        playback: {
          play: async () => undefined,
          pause: async () => undefined,
          stop: async () => undefined,
          seek: async () => undefined,
        },
        playlist: {
          clearPlaylist: async () => undefined,
          addTracks: async () => [],
        },
        getAudioContext: async () => null,
        getAudioAnalyser: async () => null,
        on: () => () => undefined,
        registerSlot: (slot: PluginSlotDescriptor) => {
          slots.push(slot);
          return () => undefined;
        },
        fetch: async () => ({ ok: true, status: 200 }) as unknown as Response,
        notify: async () => undefined,
      } as unknown as PluginContext;

      await liveBroadcastPlugin.activate(mockCtx);
      assert.deepEqual(
        slots.map(s => s.slot).sort(),
        ['panel', 'track-info'],
      );
      await liveBroadcastPlugin.deactivate?.();
    });
  });
});
