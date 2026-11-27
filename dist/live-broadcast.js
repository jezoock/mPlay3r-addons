// mPlay3r addon bundle: mplay3r.live-broadcast@1.0.0 (generated from plugins/live-broadcast/src)

const ICECAST_DEFAULT_MIME = 'audio/ogg; codecs=opus';
function toBase64Ascii(input) {
    if (typeof btoa === 'function') {
        return btoa(input);
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytes = new TextEncoder().encode(input);
    let out = '';
    for(let i = 0; i < bytes.length; i += 3){
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const triple = a << 16 | b << 8 | c;
        out += chars[triple >> 18 & 63];
        out += chars[triple >> 12 & 63];
        out += i + 1 < bytes.length ? chars[triple >> 6 & 63] : '=';
        out += i + 2 < bytes.length ? chars[triple & 63] : '=';
    }
    return out;
}
function validateIcecastConfig(config) {
    const errors = [];
    const rawUrl = (config.serverUrl || '').trim();
    let normalizedOrigin = '';
    if (!/^https?:\/\/\S+/i.test(rawUrl)) {
        errors.push('Icecast server URL must start with http:// or https://');
    } else {
        try {
            const parsed = new URL(rawUrl);
            normalizedOrigin = parsed.origin;
        } catch  {
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
        errors
    };
}
function buildIcecastSourceHeaders(config) {
    const user = (config.username || 'source').trim() || 'source';
    const auth = `Basic ${toBase64Ascii(`${user}:${config.password}`)}`;
    const headers = {
        Authorization: auth,
        'Content-Type': config.mimeType || ICECAST_DEFAULT_MIME,
        'Ice-Public': config.isPublic ? '1' : '0',
        'Ice-Name': (config.streamName || 'mPlay3r Live').trim()
    };
    if (config.genre?.trim()) {
        headers['Ice-Genre'] = config.genre.trim();
    }
    if (config.bitrateKbps && Number.isFinite(config.bitrateKbps)) {
        headers['Ice-Bitrate'] = String(Math.round(config.bitrateKbps));
    }
    return headers;
}
class IcecastPushController {
    fetcher;
    abortController = null;
    activeTargetUrl = null;
    bytesSent = 0;
    constructor(fetcher){
        this.fetcher = fetcher;
    }
    isStreaming() {
        return this.activeTargetUrl !== null;
    }
    getStatus() {
        return {
            streaming: this.activeTargetUrl !== null,
            targetUrl: this.activeTargetUrl,
            bytesSent: this.bytesSent
        };
    }
    async start(config, body) {
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
            signal: controller?.signal
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
        return {
            targetUrl: check.targetUrl
        };
    }
    stop() {
        this.abortController?.abort();
        this.abortController = null;
        this.activeTargetUrl = null;
    }
}

const DEFAULT_DRIFT_TOLERANCE_SECONDS = 0.6;
function broadcastRandomBytes(len) {
    const bytes = new Uint8Array(len);
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
        return bytes;
    }
    for(let i = 0; i < len; i += 1){
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
}
function generateBroadcastToken(byteLength = 16) {
    const bytes = broadcastRandomBytes(Math.max(8, byteLength));
    let hex = '';
    for (const b of bytes){
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}
function isValidSessionTokenFormat(token) {
    if (!token) return false;
    return /^[A-Za-z0-9._-]{8,128}$/.test(token.trim());
}
function constantTimeTokenEqual(a, b) {
    if (a.length !== b.length || a.length === 0) {
        return false;
    }
    let diff = 0;
    for(let i = 0; i < a.length; i += 1){
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
function estimateRemotePosition(state, nowMs = Date.now(), oneWayLatencyMs = 0) {
    if (state.status === 'stopped' || !state.track) {
        return 0;
    }
    const base = Number.isFinite(state.positionSeconds) && state.positionSeconds > 0 ? state.positionSeconds : 0;
    let projected = base;
    if (state.status === 'playing') {
        const rate = Number.isFinite(state.playbackRate) && state.playbackRate > 0 ? state.playbackRate : 1;
        const elapsedMs = Math.max(0, nowMs - state.updatedAtMs) + Math.max(0, oneWayLatencyMs);
        projected = base + elapsedMs / 1000 * rate;
    }
    if (state.track.duration && state.track.duration > 0) {
        return Math.min(state.track.duration, Math.max(0, projected));
    }
    return Math.max(0, projected);
}
function reconcileListenerPlayback(remote, local, options = {}) {
    const tolerance = options.driftToleranceSeconds ?? DEFAULT_DRIFT_TOLERANCE_SECONDS;
    const expectedPosition = estimateRemotePosition(remote, options.nowMs ?? Date.now(), options.oneWayLatencyMs ?? 0);
    if (remote.status === 'stopped' || !remote.track) {
        return {
            loadTrack: null,
            seekTo: null,
            targetStatus: 'stopped',
            expectedPosition: 0,
            driftSeconds: 0
        };
    }
    const sameTrack = local.trackId === remote.track.id || Boolean(local.trackSrc) && local.trackSrc === remote.track.streamUrl;
    const localPos = Number.isFinite(local.currentTime) && local.currentTime >= 0 ? local.currentTime : 0;
    const driftSeconds = expectedPosition - localPos;
    if (!sameTrack) {
        return {
            loadTrack: remote.track,
            seekTo: expectedPosition > 0.25 ? expectedPosition : null,
            targetStatus: remote.status,
            expectedPosition,
            driftSeconds
        };
    }
    const needsSeek = Math.abs(driftSeconds) > tolerance;
    return {
        loadTrack: null,
        seekTo: needsSeek ? expectedPosition : null,
        targetStatus: remote.status,
        expectedPosition,
        driftSeconds
    };
}
function formatSseEvent(event, payload, id) {
    const lines = [];
    if (id !== undefined) lines.push(`id: ${String(id)}`);
    if (event) lines.push(`event: ${event}`);
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const dataLine of data.split(/\r?\n/)){
        lines.push(`data: ${dataLine}`);
    }
    return `${lines.join('\n')}\n\n`;
}
function parseSseChunk(rawBuffer) {
    const normalized = rawBuffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    const remainder = blocks.pop() ?? '';
    const events = [];
    for (const block of blocks){
        if (!block.trim()) continue;
        let event = 'message';
        let id;
        const dataLines = [];
        for (const line of block.split('\n')){
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
            events.push({
                event,
                id,
                data: dataLines.join('\n')
            });
        }
    }
    return {
        events,
        remainder
    };
}
class BroadcastHostStateManager {
    sessionId;
    token;
    state;
    listeners = new Set();
    subscribers = new Set();
    constructor(options = {}){
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
            sequence: 0
        };
    }
    getToken() {
        return this.token;
    }
    rotateToken() {
        this.token = generateBroadcastToken(16);
        return this.token;
    }
    validateToken(candidate) {
        if (!isValidSessionTokenFormat(candidate)) return false;
        return constantTimeTokenEqual(candidate.trim(), this.token);
    }
    getState() {
        return {
            ...this.state,
            track: this.state.track ? {
                ...this.state.track
            } : null
        };
    }
    subscribe(listener) {
        this.subscribers.add(listener);
        return ()=>{
            this.subscribers.delete(listener);
        };
    }
    emit() {
        const snap = this.getState();
        for (const sub of this.subscribers){
            sub(snap);
        }
        return snap;
    }
    addListener(listenerId, providedToken) {
        if (!this.validateToken(providedToken)) {
            return false;
        }
        this.listeners.add(listenerId);
        this.state = {
            ...this.state,
            listenerCount: this.listeners.size,
            sequence: this.state.sequence + 1
        };
        this.emit();
        return true;
    }
    removeListener(listenerId) {
        if (this.listeners.delete(listenerId)) {
            this.state = {
                ...this.state,
                listenerCount: this.listeners.size,
                sequence: this.state.sequence + 1
            };
            this.emit();
        }
    }
    getListenerCount() {
        return this.listeners.size;
    }
    updateFromHost(patch, nowMs = Date.now()) {
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
                    format: patch.track.format
                };
            }
        }
        this.state = {
            ...this.state,
            status: patch.status ?? this.state.status,
            track: nextTrack,
            positionSeconds: patch.positionSeconds !== undefined && Number.isFinite(patch.positionSeconds) ? Math.max(0, patch.positionSeconds) : this.state.positionSeconds,
            playbackRate: patch.playbackRate !== undefined && Number.isFinite(patch.playbackRate) && patch.playbackRate > 0 ? patch.playbackRate : this.state.playbackRate,
            updatedAtMs: nowMs,
            sequence: this.state.sequence + 1
        };
        return this.emit();
    }
    toSseFrame() {
        return formatSseEvent('sync', this.getState(), this.state.sequence);
    }
}
class SseBroadcastListener {
    hooks;
    createEventSource;
    driftToleranceSeconds;
    eventSource = null;
    oneWayLatencyMs = 0;
    lastRemoteState = null;
    connected = false;
    closed = false;
    onUpdateCb;
    constructor(hooks, options = {}){
        this.hooks = hooks;
        this.driftToleranceSeconds = options.driftToleranceSeconds ?? DEFAULT_DRIFT_TOLERANCE_SECONDS;
        this.onUpdateCb = options.onUpdate;
        this.createEventSource = options.createEventSource ?? ((url)=>{
            if (typeof EventSource === 'undefined') {
                throw new Error('EventSource is not available in this environment.');
            }
            return new EventSource(url);
        });
    }
    setOneWayLatencyMs(ms) {
        this.oneWayLatencyMs = Number.isFinite(ms) && ms >= 0 ? ms : 0;
    }
    getOneWayLatencyMs() {
        return this.oneWayLatencyMs;
    }
    isConnected() {
        return this.connected && !this.closed;
    }
    getLastState() {
        return this.lastRemoteState;
    }
    connect(baseUrl, sessionToken) {
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
        const handleRawData = (raw)=>{
            if (this.closed) return;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.status === 'string') {
                    void this.applyRemoteState(parsed);
                }
            } catch  {}
        };
        es.onopen = ()=>{
            if (!this.closed) {
                this.connected = true;
            }
        };
        es.onmessage = (ev)=>handleRawData(ev.data);
        es.addEventListener?.('sync', (ev)=>handleRawData(ev.data));
        es.onerror = ()=>{
            this.connected = false;
        };
        return sseUrl;
    }
    async applyRemoteState(remote, nowMs = Date.now()) {
        this.lastRemoteState = remote;
        const local = this.hooks.getLocalState();
        const plan = reconcileListenerPlayback(remote, local, {
            nowMs,
            oneWayLatencyMs: this.oneWayLatencyMs,
            driftToleranceSeconds: this.driftToleranceSeconds
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
    close() {
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

const DEFAULT_RTC_ICE_SERVERS = [
    {
        urls: 'stun:stun.l.google.com:19302'
    }
];
function toBase64Url(input) {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const b of bytes)binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(encoded) {
    const normalized = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i += 1)bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}
function encodeSignalingPayload(payload) {
    return toBase64Url(JSON.stringify(payload));
}
function decodeSignalingPayload(encoded) {
    try {
        const parsed = JSON.parse(fromBase64Url(encoded));
        if (parsed.type !== 'offer' && parsed.type !== 'answer' || typeof parsed.sdp !== 'string' || !parsed.sdp.trim() || typeof parsed.sessionId !== 'string' || !parsed.sessionId.trim() || typeof parsed.peerId !== 'string' || !parsed.peerId.trim() || !isValidSessionTokenFormat(parsed.token)) {
            return null;
        }
        return {
            type: parsed.type,
            sdp: parsed.sdp,
            sessionId: parsed.sessionId,
            token: parsed.token.trim(),
            peerId: parsed.peerId,
            name: typeof parsed.name === 'string' ? parsed.name : undefined
        };
    } catch  {
        return null;
    }
}
function captureAudioContextStream(audioCtx, tapSourceNode) {
    const destination = audioCtx.createMediaStreamDestination();
    if (tapSourceNode) {
        tapSourceNode.connect(destination);
    }
    let disconnected = false;
    return {
        stream: destination.stream,
        destination,
        disconnect () {
            if (disconnected) return;
            disconnected = true;
            if (tapSourceNode) {
                try {
                    tapSourceNode.disconnect(destination);
                } catch  {}
            }
            for (const track of destination.stream.getTracks()){
                try {
                    track.stop();
                } catch  {}
            }
        }
    };
}
function defaultCreatePeerConnection(config) {
    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC RTCPeerConnection is not supported in this browser.');
    }
    return new RTCPeerConnection(config);
}
class WebRtcBroadcastHost {
    sessionId;
    token;
    hostName;
    createPc;
    iceServers;
    tap = null;
    peers = new Map();
    onPeerCountChange;
    constructor(options = {}){
        this.sessionId = options.sessionId || `rtc-${generateBroadcastToken(6)}`;
        this.token = options.token || generateBroadcastToken(16);
        this.hostName = options.hostName || 'mPlay3r P2P Host';
        this.iceServers = options.iceServers ?? DEFAULT_RTC_ICE_SERVERS;
        this.createPc = options.createPeerConnection ?? defaultCreatePeerConnection;
        this.onPeerCountChange = options.onPeerCountChange;
    }
    getToken() {
        return this.token;
    }
    isBroadcasting() {
        return this.tap !== null;
    }
    getPeerCount() {
        return this.peers.size;
    }
    startCapture(audioCtx, tapSourceNode) {
        this.stop();
        this.tap = captureAudioContextStream(audioCtx, tapSourceNode);
        return this.tap.stream;
    }
    async createListenerOffer(peerId = `peer-${generateBroadcastToken(4)}`) {
        if (!this.tap) {
            throw new Error('Start live audio capture before creating a WebRTC offer.');
        }
        const pc = this.createPc({
            iceServers: this.iceServers
        });
        for (const track of this.tap.stream.getAudioTracks()){
            pc.addTrack(track, this.tap.stream);
        }
        const handleState = ()=>{
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
            name: this.hostName
        });
        return {
            peerId,
            offerCode
        };
    }
    async acceptListenerAnswer(answerCode) {
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
        await pc.setRemoteDescription({
            type: 'answer',
            sdp: payload.sdp
        });
        return {
            peerId: payload.peerId
        };
    }
    removePeer(peerId) {
        const pc = this.peers.get(peerId);
        if (!pc) return false;
        this.peers.delete(peerId);
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onicecandidate = null;
        try {
            pc.close();
        } catch  {}
        this.onPeerCountChange?.(this.peers.size);
        return true;
    }
    stop() {
        for (const peerId of Array.from(this.peers.keys())){
            this.removePeer(peerId);
        }
        if (this.tap) {
            this.tap.disconnect();
            this.tap = null;
        }
    }
}
class WebRtcBroadcastListener {
    createPc;
    iceServers;
    pc = null;
    remoteStream = null;
    hostName = '';
    onRemoteStream;
    constructor(options = {}){
        this.iceServers = options.iceServers ?? DEFAULT_RTC_ICE_SERVERS;
        this.createPc = options.createPeerConnection ?? defaultCreatePeerConnection;
        this.onRemoteStream = options.onRemoteStream;
    }
    isConnected() {
        return this.pc !== null;
    }
    getHostName() {
        return this.hostName;
    }
    getRemoteStream() {
        return this.remoteStream;
    }
    async joinWithOffer(offerCode, expectedToken) {
        const payload = decodeSignalingPayload(offerCode);
        if (!payload || payload.type !== 'offer') {
            throw new Error('Invalid WebRTC offer code.');
        }
        if (expectedToken && !constantTimeTokenEqual(payload.token, expectedToken.trim())) {
            throw new Error('Unauthorized WebRTC offer: session token mismatch.');
        }
        this.disconnect();
        const pc = this.createPc({
            iceServers: this.iceServers
        });
        this.pc = pc;
        this.hostName = payload.name || 'mPlay3r P2P Host';
        pc.ontrack = (ev)=>{
            const stream = ev.streams?.[0] ?? null;
            if (stream) {
                this.remoteStream = stream;
                this.onRemoteStream?.(stream);
            }
        };
        await pc.setRemoteDescription({
            type: 'offer',
            sdp: payload.sdp
        });
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
            peerId: payload.peerId
        });
        return {
            answerCode,
            hostName: this.hostName,
            sessionId: payload.sessionId
        };
    }
    disconnect() {
        if (this.remoteStream) {
            for (const track of this.remoteStream.getTracks()){
                try {
                    track.stop();
                } catch  {}
            }
            this.remoteStream = null;
        }
        if (this.pc) {
            this.pc.ontrack = null;
            this.pc.onconnectionstatechange = null;
            this.pc.oniceconnectionstatechange = null;
            try {
                this.pc.close();
            } catch  {}
            this.pc = null;
        }
        this.hostName = '';
    }
}

export const manifest = {
    id: 'mplay3r.live-broadcast',
    name: 'Live Broadcast & Listening Party',
    version: '1.0.0',
    description: 'Stream live playback to synchronized listeners over LAN/SSE (with latency compensation, listener counter, session token & optional Icecast push) or P2P WebRTC directly from Web Audio.',
    category: 'broadcast',
    permissions: [
        'audio-context',
        'network',
        'local-server',
        'playlist-write',
        'playback-control',
        'ui-slot',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
let activeSseListener = null;
let activeRtcHost = null;
let activeRtcListener = null;
let activeIcecast = null;
let activeRemoteAudioEl = null;
const BC_INPUT_CSS = 'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.75rem';
const BC_CARD_CSS = 'display:flex;flex-direction:column;gap:0.35rem;padding:0.45rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
function bcEl(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}
function bcBtn(label, onClick, variant = 'ghost') {
    const styles = {
        ghost: 'padding:0.2rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer',
        accent: 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
        solid: 'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer'
    };
    const btn = bcEl('button', styles[variant], label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}
function cleanupRemoteAudio() {
    if (activeRemoteAudioEl) {
        activeRemoteAudioEl.pause();
        activeRemoteAudioEl.srcObject = null;
        activeRemoteAudioEl = null;
    }
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const fetcher = (input, init)=>ctx.fetch(input, init);
        const savedToken = await ctx.storage.get('broadcastSessionToken');
        const hostManager = new BroadcastHostStateManager({
            token: typeof savedToken === 'string' && savedToken.length >= 8 ? savedToken : undefined
        });
        await ctx.storage.set('broadcastSessionToken', hostManager.getToken());
        const icecast = new IcecastPushController(fetcher);
        activeIcecast = icecast;
        let hostingSseUrl = '';
        let hostingSseActive = false;
        let lastPushedPosition = -1;
        let badgeEl = null;
        let rerenderPanel = null;
        const rtcHost = new WebRtcBroadcastHost({
            sessionId: hostManager.sessionId,
            token: hostManager.getToken(),
            onPeerCountChange: ()=>{
                renderBadge();
                rerenderPanel?.();
            }
        });
        activeRtcHost = rtcHost;
        const rtcListener = new WebRtcBroadcastListener({
            onRemoteStream: (stream)=>{
                if (typeof Audio !== 'undefined') {
                    cleanupRemoteAudio();
                    const audio = new Audio();
                    audio.srcObject = stream;
                    void audio.play().catch(()=>undefined);
                    activeRemoteAudioEl = audio;
                }
                renderBadge();
                rerenderPanel?.();
            }
        });
        activeRtcListener = rtcListener;
        const sseListener = new SseBroadcastListener({
            async loadTrack (track) {
                await ctx.playlist.clearPlaylist();
                await ctx.playlist.addTracks([
                    {
                        id: track.id,
                        src: track.streamUrl,
                        title: track.title,
                        artist: track.artist,
                        album: track.album,
                        duration: track.duration,
                        format: track.format
                    }
                ], false);
            },
            play: ()=>ctx.playback.play(),
            pause: ()=>ctx.playback.pause(),
            stop: ()=>ctx.playback.stop(),
            seek: (seconds)=>ctx.playback.seek(seconds),
            getLocalState () {
                const snap = ctx.getState();
                return {
                    trackId: snap.currentTrack?.id ?? null,
                    trackSrc: snap.currentTrack?.src ?? null,
                    status: snap.status,
                    currentTime: snap.currentTime
                };
            }
        }, {
            onUpdate: ()=>{
                renderBadge();
                rerenderPanel?.();
            }
        });
        activeSseListener = sseListener;
        const pushHostStateToServer = async ()=>{
            if (!hostingSseActive || !hostingSseUrl) return;
            try {
                const clean = hostingSseUrl.replace(/\/+$/, '');
                await fetcher(`${clean}/api/broadcast/state`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${hostManager.getToken()}`
                    },
                    body: JSON.stringify(hostManager.getState())
                });
            } catch  {}
        };
        const renderBadge = ()=>{
            if (!badgeEl) return;
            const isHost = hostingSseActive || rtcHost.isBroadcasting() || icecast.isStreaming();
            const isListener = sseListener.isConnected() || rtcListener.isConnected();
            if (!isHost && !isListener) {
                badgeEl.textContent = '';
                badgeEl.style.display = 'none';
                return;
            }
            badgeEl.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.72rem';
            badgeEl.innerHTML = '';
            const pill = bcEl('span', 'padding:0.1rem 0.45rem;border-radius:999px;font-weight:700;font-size:0.66rem;background:var(--ds-color-primary-base);color:var(--mp-accent-contrast)', isHost ? 'ON AIR' : 'PARTY SYNC');
            const listeners = hostManager.getListenerCount() + rtcHost.getPeerCount();
            const detail = isHost ? `${listeners} listener${listeners === 1 ? '' : 's'}${rtcHost.isBroadcasting() ? ' · WebRTC P2P' : ''}` : rtcListener.isConnected() ? `P2P · ${rtcListener.getHostName()}` : `Synced · ${sseListener.getLastState()?.listenerCount ?? 1} online`;
            badgeEl.append(pill, bcEl('span', 'color:var(--mp-text-muted)', detail));
        };
        ctx.on('stateChange', (snap)=>{
            if (!hostingSseActive) return;
            const status = snap.status === 'playing' || snap.status === 'paused' ? snap.status : 'stopped';
            hostManager.updateFromHost({
                status,
                track: snap.currentTrack,
                positionSeconds: snap.currentTime
            });
            lastPushedPosition = snap.currentTime;
            void pushHostStateToServer();
        });
        ctx.on('trackChange', ({ track })=>{
            if (!hostingSseActive) return;
            const snap = ctx.getState();
            const status = snap.status === 'playing' || snap.status === 'paused' ? snap.status : 'stopped';
            hostManager.updateFromHost({
                status,
                track,
                positionSeconds: 0
            });
            lastPushedPosition = 0;
            void pushHostStateToServer();
        });
        ctx.on('timeUpdate', ({ currentTime })=>{
            if (!hostingSseActive) return;
            if (Math.abs(currentTime - lastPushedPosition) > 2) {
                lastPushedPosition = currentTime;
                hostManager.updateFromHost({
                    positionSeconds: currentTime
                });
                void pushHostStateToServer();
            } else {
                lastPushedPosition = currentTime;
            }
        });
        ctx.registerSlot({
            id: 'broadcast-status-badge',
            slot: 'track-info',
            mount (container) {
                badgeEl = container;
                renderBadge();
                return ()=>{
                    badgeEl = null;
                };
            }
        });
        ctx.registerSlot({
            id: 'live-broadcast-panel',
            slot: 'panel',
            title: 'Live Broadcast',
            mount (container) {
                let activeTab = 'host';
                let joinUrlDraft = '';
                let joinTokenDraft = '';
                let offerDraft = '';
                let answerDraft = '';
                let generatedOfferCode = '';
                let generatedAnswerCode = '';
                let icecastUrl = '';
                let icecastMount = '/mplay3r.ogg';
                let icecastPass = '';
                const renderPanel = ()=>{
                    container.innerHTML = '';
                    const wrap = bcEl('div', 'display:flex;flex-direction:column;gap:0.5rem');
                    const tabs = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem');
                    tabs.append(bcBtn('Host (SSE / Icecast)', ()=>{
                        activeTab = 'host';
                        renderPanel();
                    }, activeTab === 'host' ? 'solid' : 'ghost'), bcBtn('Join Party', ()=>{
                        activeTab = 'join';
                        renderPanel();
                    }, activeTab === 'join' ? 'solid' : 'ghost'), bcBtn('Web P2P (WebRTC)', ()=>{
                        activeTab = 'p2p';
                        renderPanel();
                    }, activeTab === 'p2p' ? 'solid' : 'ghost'));
                    wrap.append(tabs);
                    if (activeTab === 'host') {
                        const sseCard = bcEl('div', BC_CARD_CSS);
                        sseCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'LAN / Reverse-Proxy Listening Party (SSE)'));
                        const urlInput = bcEl('input', BC_INPUT_CSS);
                        urlInput.type = 'url';
                        urlInput.placeholder = 'Companion server URL (e.g. http://192.168.1.42:8765)';
                        urlInput.value = hostingSseUrl;
                        urlInput.addEventListener('input', ()=>{
                            hostingSseUrl = urlInput.value;
                        });
                        const row = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center');
                        row.append(bcBtn(hostingSseActive ? 'Stop Hosting' : 'Start SSE Sync', ()=>{
                            if (hostingSseActive) {
                                hostingSseActive = false;
                            } else {
                                if (!/^https?:\/\/\S+/i.test(hostingSseUrl.trim())) {
                                    void ctx.notify('Enter a valid companion server URL first.', 'warning');
                                    return;
                                }
                                hostingSseActive = true;
                                const snap = ctx.getState();
                                hostManager.updateFromHost({
                                    status: snap.status === 'playing' || snap.status === 'paused' ? snap.status : 'stopped',
                                    track: snap.currentTrack,
                                    positionSeconds: snap.currentTime
                                });
                                void pushHostStateToServer();
                            }
                            renderBadge();
                            renderPanel();
                        }, hostingSseActive ? 'accent' : 'solid'), bcBtn('Rotate Token', ()=>{
                            const next = hostManager.rotateToken();
                            void ctx.storage.set('broadcastSessionToken', next).then(()=>renderPanel());
                        }), bcEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', `Token: ${hostManager.getToken().slice(0, 12)}…`));
                        sseCard.append(urlInput, row);
                        const iceCard = bcEl('div', BC_CARD_CSS);
                        iceCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Optional Icecast 2.4+ Source Push'));
                        const iceRow = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem');
                        const iceUrlIn = bcEl('input', `${BC_INPUT_CSS};flex:1 1 9rem`);
                        iceUrlIn.placeholder = 'http://icecast.local:8000';
                        iceUrlIn.value = icecastUrl;
                        iceUrlIn.addEventListener('input', ()=>{
                            icecastUrl = iceUrlIn.value;
                        });
                        const iceMountIn = bcEl('input', `${BC_INPUT_CSS};width:7rem`);
                        iceMountIn.placeholder = '/mplay3r.ogg';
                        iceMountIn.value = icecastMount;
                        iceMountIn.addEventListener('input', ()=>{
                            icecastMount = iceMountIn.value;
                        });
                        const icePassIn = bcEl('input', `${BC_INPUT_CSS};width:7rem`);
                        icePassIn.type = 'password';
                        icePassIn.placeholder = 'Source pass';
                        icePassIn.value = icecastPass;
                        icePassIn.addEventListener('input', ()=>{
                            icecastPass = icePassIn.value;
                        });
                        iceRow.append(iceUrlIn, iceMountIn, icePassIn, bcBtn('Validate Icecast', ()=>{
                            const cfg = {
                                serverUrl: icecastUrl,
                                mountpoint: icecastMount,
                                password: icecastPass
                            };
                            const res = validateIcecastConfig(cfg);
                            void ctx.notify(res.valid ? `Icecast target ready: ${res.targetUrl}` : res.errors.join(' · '), res.valid ? 'success' : 'error');
                        }, 'accent'));
                        iceCard.append(iceRow);
                        wrap.append(sseCard, iceCard);
                    } else if (activeTab === 'join') {
                        const joinCard = bcEl('div', BC_CARD_CSS);
                        joinCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Join Synchronized Listening Party'));
                        const uIn = bcEl('input', BC_INPUT_CSS);
                        uIn.type = 'url';
                        uIn.placeholder = 'Host URL (e.g. http://192.168.1.42:8765)';
                        uIn.value = joinUrlDraft;
                        uIn.addEventListener('input', ()=>{
                            joinUrlDraft = uIn.value;
                        });
                        const tIn = bcEl('input', BC_INPUT_CSS);
                        tIn.type = 'password';
                        tIn.placeholder = 'Session token';
                        tIn.value = joinTokenDraft;
                        tIn.addEventListener('input', ()=>{
                            joinTokenDraft = tIn.value;
                        });
                        const btnRow = bcEl('div', 'display:flex;gap:0.35rem;align-items:center');
                        btnRow.append(bcBtn(sseListener.isConnected() ? 'Leave Party' : 'Join via SSE', ()=>{
                            if (sseListener.isConnected()) {
                                sseListener.close();
                            } else {
                                try {
                                    sseListener.connect(joinUrlDraft, joinTokenDraft);
                                    void ctx.notify('Connected to live listening party', 'success');
                                } catch (err) {
                                    void ctx.notify(err instanceof Error ? err.message : 'Unable to join party', 'error');
                                }
                            }
                            renderBadge();
                            renderPanel();
                        }, sseListener.isConnected() ? 'accent' : 'solid'), bcEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', sseListener.isConnected() ? `Latency comp: ${sseListener.getOneWayLatencyMs()}ms` : 'Syncs play, pause, seek & track changes automatically.'));
                        joinCard.append(uIn, tIn, btnRow);
                        wrap.append(joinCard);
                    } else {
                        const hostCard = bcEl('div', BC_CARD_CSS);
                        hostCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Host WebRTC P2P Audio (Zero Media Server)'));
                        const hostBtns = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center');
                        hostBtns.append(bcBtn(rtcHost.isBroadcasting() ? 'Stop P2P Broadcast' : 'Capture Audio & Start P2P', ()=>{
                            if (rtcHost.isBroadcasting()) {
                                rtcHost.stop();
                                generatedOfferCode = '';
                                renderBadge();
                                renderPanel();
                                return;
                            }
                            void (async ()=>{
                                const audioCtx = await ctx.getAudioContext();
                                const analyser = await ctx.getAudioAnalyser();
                                if (!audioCtx) {
                                    await ctx.notify('Start playing audio first to initialize the Web Audio graph.', 'warning');
                                    return;
                                }
                                rtcHost.startCapture(audioCtx, analyser);
                                const { offerCode } = await rtcHost.createListenerOffer();
                                generatedOfferCode = offerCode;
                                renderBadge();
                                renderPanel();
                            })();
                        }, rtcHost.isBroadcasting() ? 'accent' : 'solid'), bcEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', `Peers: ${rtcHost.getPeerCount()}`));
                        hostCard.append(hostBtns);
                        if (generatedOfferCode) {
                            const offerOut = bcEl('textarea', `${BC_INPUT_CSS};min-height:3rem;font-family:monospace`);
                            offerOut.readOnly = true;
                            offerOut.value = generatedOfferCode;
                            const ansRow = bcEl('div', 'display:flex;gap:0.3rem');
                            const ansIn = bcEl('input', `${BC_INPUT_CSS};flex:1`);
                            ansIn.placeholder = 'Paste listener answer code…';
                            ansIn.value = answerDraft;
                            ansIn.addEventListener('input', ()=>{
                                answerDraft = ansIn.value;
                            });
                            ansRow.append(ansIn, bcBtn('Accept Answer', ()=>{
                                void rtcHost.acceptListenerAnswer(answerDraft).then(()=>{
                                    answerDraft = '';
                                    void ctx.notify('Listener connected via WebRTC P2P!', 'success');
                                    renderPanel();
                                }).catch((err)=>ctx.notify(err instanceof Error ? err.message : 'Invalid answer', 'error'));
                            }, 'accent'));
                            hostCard.append(offerOut, ansRow);
                        }
                        const listenCard = bcEl('div', BC_CARD_CSS);
                        listenCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Listen via WebRTC P2P'));
                        const offRow = bcEl('div', 'display:flex;gap:0.3rem');
                        const offIn = bcEl('input', `${BC_INPUT_CSS};flex:1`);
                        offIn.placeholder = 'Paste host WebRTC offer code…';
                        offIn.value = offerDraft;
                        offIn.addEventListener('input', ()=>{
                            offerDraft = offIn.value;
                        });
                        offRow.append(offIn, bcBtn(rtcListener.isConnected() ? 'Disconnect' : 'Join P2P', ()=>{
                            if (rtcListener.isConnected()) {
                                rtcListener.disconnect();
                                cleanupRemoteAudio();
                                generatedAnswerCode = '';
                                renderBadge();
                                renderPanel();
                                return;
                            }
                            void rtcListener.joinWithOffer(offerDraft).then(({ answerCode })=>{
                                generatedAnswerCode = answerCode;
                                void ctx.notify('Answer generated — send it back to the host!', 'success');
                                renderBadge();
                                renderPanel();
                            }).catch((err)=>ctx.notify(err instanceof Error ? err.message : 'Invalid offer', 'error'));
                        }, rtcListener.isConnected() ? 'accent' : 'solid'));
                        listenCard.append(offRow);
                        if (generatedAnswerCode) {
                            const ansOut = bcEl('textarea', `${BC_INPUT_CSS};min-height:3rem;font-family:monospace`);
                            ansOut.readOnly = true;
                            ansOut.value = generatedAnswerCode;
                            listenCard.append(ansOut);
                        }
                        wrap.append(hostCard, listenCard);
                    }
                    container.append(wrap);
                };
                rerenderPanel = renderPanel;
                renderPanel();
                return ()=>{
                    rerenderPanel = null;
                    container.innerHTML = '';
                };
            }
        });
    },
    deactivate () {
        activeSseListener?.close();
        activeSseListener = null;
        activeRtcHost?.stop();
        activeRtcHost = null;
        activeRtcListener?.disconnect();
        activeRtcListener = null;
        activeIcecast?.stop();
        activeIcecast = null;
        cleanupRemoteAudio();
    }
};
export default plugin;
