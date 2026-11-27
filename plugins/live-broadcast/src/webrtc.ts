import { constantTimeTokenEqual, generateBroadcastToken, isValidSessionTokenFormat } from './sync';

export const DEFAULT_RTC_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export interface SignalingPayload {
  type: 'offer' | 'answer';
  sdp: string;
  sessionId: string;
  token: string;
  peerId: string;
  name?: string;
}

export interface MediaTrackLike {
  kind: string;
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
  getAudioTracks(): MediaTrackLike[];
}

export interface AudioDestinationTap {
  stream: MediaStreamLike;
  destination: AudioNode;
  disconnect(): void;
}

export interface PeerConnectionLike {
  localDescription: { type: string; sdp?: string } | null;
  connectionState?: string;
  iceConnectionState?: string;
  onicecandidate?: ((ev: { candidate: unknown }) => void) | null;
  onconnectionstatechange?: (() => void) | null;
  oniceconnectionstatechange?: (() => void) | null;
  ontrack?: ((ev: { streams?: MediaStreamLike[]; track?: MediaTrackLike }) => void) | null;
  addTrack(track: MediaTrackLike, stream: MediaStreamLike): unknown;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(desc: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(desc: { type: string; sdp?: string }): Promise<void>;
  close(): void;
}

export type PeerConnectionFactory = (config: RTCConfiguration) => PeerConnectionLike;

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const normalized = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encodes a WebRTC SDP offer/answer + session token into a compact copyable signaling code. */
export function encodeSignalingPayload(payload: SignalingPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Decodes and validates a WebRTC SDP signaling code. */
export function decodeSignalingPayload(encoded: string): SignalingPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<SignalingPayload>;
    if (
      (parsed.type !== 'offer' && parsed.type !== 'answer') ||
      typeof parsed.sdp !== 'string' ||
      !parsed.sdp.trim() ||
      typeof parsed.sessionId !== 'string' ||
      !parsed.sessionId.trim() ||
      typeof parsed.peerId !== 'string' ||
      !parsed.peerId.trim() ||
      !isValidSessionTokenFormat(parsed.token)
    ) {
      return null;
    }
    return {
      type: parsed.type,
      sdp: parsed.sdp,
      sessionId: parsed.sessionId,
      token: parsed.token.trim(),
      peerId: parsed.peerId,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Captures the live Web Audio output via `AudioContext.createMediaStreamDestination()`.
 * Optionally connects `tapSourceNode` (e.g. AnalyserNode or master GainNode) directly into the
 * destination node, returning a `disconnect()` handle that cleanly stops tracks & detaches nodes.
 */
export function captureAudioContextStream(
  audioCtx: { createMediaStreamDestination(): { stream: MediaStreamLike } & AudioNode },
  tapSourceNode?: { connect(dest: AudioNode): unknown; disconnect(dest?: AudioNode): void } | null,
): AudioDestinationTap {
  const destination = audioCtx.createMediaStreamDestination();
  if (tapSourceNode) {
    tapSourceNode.connect(destination);
  }
  let disconnected = false;
  return {
    stream: destination.stream,
    destination,
    disconnect() {
      if (disconnected) return;
      disconnected = true;
      if (tapSourceNode) {
        try {
          tapSourceNode.disconnect(destination);
        } catch {
          // Ignore disconnect errors if graph was already torn down.
        }
      }
      for (const track of destination.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors.
        }
      }
    },
  };
}

function defaultCreatePeerConnection(config: RTCConfiguration): PeerConnectionLike {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC RTCPeerConnection is not supported in this browser.');
  }
  return new RTCPeerConnection(config) as unknown as PeerConnectionLike;
}

/**
 * Serverless P2P WebRTC live audio broadcaster capturing Web Audio output (`MediaStreamAudioDestinationNode`).
 * Manages per-listener `RTCPeerConnection`s, validates session tokens, tracks connected peer count,
 * and tears down every connection and MediaStreamTrack cleanly on `stop()`.
 */
export class WebRtcBroadcastHost {
  readonly sessionId: string;
  private readonly token: string;
  private readonly hostName: string;
  private readonly createPc: PeerConnectionFactory;
  private readonly iceServers: RTCIceServer[];
  private tap: AudioDestinationTap | null = null;
  private readonly peers = new Map<string, PeerConnectionLike>();
  private onPeerCountChange?: (count: number) => void;

  constructor(
    options: {
      sessionId?: string;
      token?: string;
      hostName?: string;
      iceServers?: RTCIceServer[];
      createPeerConnection?: PeerConnectionFactory;
      onPeerCountChange?: (count: number) => void;
    } = {},
  ) {
    this.sessionId = options.sessionId || `rtc-${generateBroadcastToken(6)}`;
    this.token = options.token || generateBroadcastToken(16);
    this.hostName = options.hostName || 'mPlay3r P2P Host';
    this.iceServers = options.iceServers ?? DEFAULT_RTC_ICE_SERVERS;
    this.createPc = options.createPeerConnection ?? defaultCreatePeerConnection;
    this.onPeerCountChange = options.onPeerCountChange;
  }

  getToken(): string {
    return this.token;
  }

  isBroadcasting(): boolean {
    return this.tap !== null;
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  /** Starts capturing live audio from an `AudioContext` (and optional tap node like `AnalyserNode`). */
  startCapture(
    audioCtx: { createMediaStreamDestination(): { stream: MediaStreamLike } & AudioNode },
    tapSourceNode?: { connect(dest: AudioNode): unknown; disconnect(dest?: AudioNode): void } | null,
  ): MediaStreamLike {
    this.stop();
    this.tap = captureAudioContextStream(audioCtx, tapSourceNode);
    return this.tap.stream;
  }

  /** Creates a new peer connection & encoded SDP offer for a listener to paste or scan. */
  async createListenerOffer(peerId = `peer-${generateBroadcastToken(4)}`): Promise<{ peerId: string; offerCode: string }> {
    if (!this.tap) {
      throw new Error('Start live audio capture before creating a WebRTC offer.');
    }

    const pc = this.createPc({ iceServers: this.iceServers });
    for (const track of this.tap.stream.getAudioTracks()) {
      pc.addTrack(track, this.tap.stream);
    }

    const handleState = () => {
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        this.removePeer(peerId);
      }
    };
    pc.onconnectionstatechange = handleState;
    pc.oniceconnectionstatechange = handleState;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription?.sdp || offer.sdp || '';
    if (!sdp) {
      pc.close();
      throw new Error('Failed to generate WebRTC SDP offer.');
    }

    this.peers.set(peerId, pc);
    this.onPeerCountChange?.(this.peers.size);

    const offerCode = encodeSignalingPayload({
      type: 'offer',
      sdp,
      sessionId: this.sessionId,
      token: this.token,
      peerId,
      name: this.hostName,
    });
    return { peerId, offerCode };
  }

  /** Accepts an encoded listener SDP answer after verifying sessionId & constant-time session token. */
  async acceptListenerAnswer(answerCode: string): Promise<{ peerId: string }> {
    const payload = decodeSignalingPayload(answerCode);
    if (!payload || payload.type !== 'answer') {
      throw new Error('Invalid WebRTC answer code.');
    }
    if (payload.sessionId !== this.sessionId || !constantTimeTokenEqual(payload.token, this.token)) {
      throw new Error('Unauthorized WebRTC answer: session token mismatch.');
    }
    const pc = this.peers.get(payload.peerId);
    if (!pc) {
      throw new Error(`Unknown listener peer "${payload.peerId}".`);
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    return { peerId: payload.peerId };
  }

  removePeer(peerId: string): boolean {
    const pc = this.peers.get(peerId);
    if (!pc) return false;
    this.peers.delete(peerId);
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;
    pc.onicecandidate = null;
    try {
      pc.close();
    } catch {
      // Ignore close errors.
    }
    this.onPeerCountChange?.(this.peers.size);
    return true;
  }

  /** Cleanly closes all peer connections, stops all captured MediaStreamTracks, and disconnects the Web Audio tap. */
  stop(): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.removePeer(peerId);
    }
    if (this.tap) {
      this.tap.disconnect();
      this.tap = null;
    }
  }
}

/** Serverless P2P WebRTC live audio listener receiving the host's live audio MediaStream. */
export class WebRtcBroadcastListener {
  private readonly createPc: PeerConnectionFactory;
  private readonly iceServers: RTCIceServer[];
  private pc: PeerConnectionLike | null = null;
  private remoteStream: MediaStreamLike | null = null;
  private hostName = '';
  private onRemoteStream?: (stream: MediaStreamLike) => void;

  constructor(
    options: {
      iceServers?: RTCIceServer[];
      createPeerConnection?: PeerConnectionFactory;
      onRemoteStream?: (stream: MediaStreamLike) => void;
    } = {},
  ) {
    this.iceServers = options.iceServers ?? DEFAULT_RTC_ICE_SERVERS;
    this.createPc = options.createPeerConnection ?? defaultCreatePeerConnection;
    this.onRemoteStream = options.onRemoteStream;
  }

  isConnected(): boolean {
    return this.pc !== null;
  }

  getHostName(): string {
    return this.hostName;
  }

  getRemoteStream(): MediaStreamLike | null {
    return this.remoteStream;
  }

  /** Accepts an encoded host SDP offer (optionally checking an expected token) and produces an encoded SDP answer. */
  async joinWithOffer(
    offerCode: string,
    expectedToken?: string,
  ): Promise<{ answerCode: string; hostName: string; sessionId: string }> {
    const payload = decodeSignalingPayload(offerCode);
    if (!payload || payload.type !== 'offer') {
      throw new Error('Invalid WebRTC offer code.');
    }
    if (expectedToken && !constantTimeTokenEqual(payload.token, expectedToken.trim())) {
      throw new Error('Unauthorized WebRTC offer: session token mismatch.');
    }

    this.disconnect();
    const pc = this.createPc({ iceServers: this.iceServers });
    this.pc = pc;
    this.hostName = payload.name || 'mPlay3r P2P Host';

    pc.ontrack = ev => {
      const stream = ev.streams?.[0] ?? null;
      if (stream) {
        this.remoteStream = stream;
        this.onRemoteStream?.(stream);
      }
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const sdp = pc.localDescription?.sdp || answer.sdp || '';
    if (!sdp) {
      this.disconnect();
      throw new Error('Failed to generate WebRTC SDP answer.');
    }

    const answerCode = encodeSignalingPayload({
      type: 'answer',
      sdp,
      sessionId: payload.sessionId,
      token: payload.token,
      peerId: payload.peerId,
    });
    return { answerCode, hostName: this.hostName, sessionId: payload.sessionId };
  }

  /** Cleanly closes the RTCPeerConnection and stops any received MediaStreamTracks. */
  disconnect(): void {
    if (this.remoteStream) {
      for (const track of this.remoteStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors.
        }
      }
      this.remoteStream = null;
    }
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      try {
        this.pc.close();
      } catch {
        // Ignore close errors.
      }
      this.pc = null;
    }
    this.hostName = '';
  }
}
