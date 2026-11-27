// mPlay3r addon bundle: mplay3r.library-share@1.0.0 (generated from plugins/library-share/src)

function normalizeServerBaseUrl(raw) {
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
    } catch  {
        return null;
    }
}
function sanitizeRelativeFolder(folder) {
    const trimmed = (folder || '').trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed.includes('\0') || trimmed.includes('\\') || /(?:^|\/)\.\.(?:\/|$)/.test(trimmed)) {
        return null;
    }
    return trimmed.replace(/^\/+|\/+$/g, '');
}
function isValidLanPin(pin) {
    return /^\d{4,12}$/.test((pin || '').trim());
}
function getCryptoRandomBytes(length) {
    const out = new Uint8Array(length);
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(out);
        return out;
    }
    for(let i = 0; i < length; i += 1){
        out[i] = Math.floor(Math.random() * 256);
    }
    return out;
}
function generateLanPin(digits = 6) {
    const len = Math.min(12, Math.max(4, Math.floor(digits)));
    const bytes = getCryptoRandomBytes(len);
    let pin = '';
    for(let i = 0; i < len; i += 1){
        pin += String(bytes[i] % 10);
    }
    return pin;
}
function generateBearerToken(byteLength = 24) {
    const bytes = getCryptoRandomBytes(Math.max(16, byteLength));
    let hex = '';
    for (const b of bytes){
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}
function buildShareConnectionUrl(baseUrl, options = {}) {
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
function formatLanCompanionCommand(config) {
    const quote = (val)=>`"${val.replace(/"/g, '\\"')}"`;
    const dirs = config.sharedFolders.length > 0 ? config.sharedFolders.map((dir)=>`--dir ${quote(dir)}`).join(' ') : '--dir "/path/to/Music"';
    return `mplay3r-lan-server ${dirs} --port ${config.port} --name ${quote(config.serverName)} --pin ${config.pin}`;
}

class RemoteLibraryError extends Error {
    code;
    status;
    constructor(code, message, status){
        super(message);
        this.name = 'RemoteLibraryError';
        this.code = code;
        this.status = status;
    }
}
const SAVED_SERVERS_STORAGE_KEY = 'savedServers';
class RemoteLibraryClient {
    fetcher;
    timeoutMs;
    state = 'disconnected';
    baseUrl = null;
    token = '';
    serverInfo = null;
    lastError = null;
    listeners = new Set();
    constructor(fetcher, options = {}){
        this.fetcher = fetcher;
        this.timeoutMs = options.timeoutMs ?? 8000;
    }
    getSnapshot() {
        return {
            state: this.state,
            baseUrl: this.baseUrl,
            serverInfo: this.serverInfo ? {
                ...this.serverInfo
            } : null,
            lastError: this.lastError
        };
    }
    getToken() {
        return this.token;
    }
    onStateChange(listener) {
        this.listeners.add(listener);
        return ()=>{
            this.listeners.delete(listener);
        };
    }
    emitState() {
        const snap = this.getSnapshot();
        for (const listener of this.listeners){
            listener(snap);
        }
    }
    setState(next, error = null) {
        this.state = next;
        this.lastError = error;
        this.emitState();
    }
    async fetchWithTimeout(url, init) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(()=>controller.abort(), this.timeoutMs) : undefined;
        try {
            return await this.fetcher(url, {
                ...init,
                signal: controller?.signal
            });
        } catch (err) {
            const isAbort = err instanceof Error && err.name === 'AbortError';
            const msg = isAbort ? `Connection to LAN server timed out after ${this.timeoutMs}ms` : err instanceof Error ? err.message : 'Network connection to LAN server lost';
            if (this.baseUrl) {
                this.setState('reconnecting', msg);
            } else {
                this.setState('error', msg);
            }
            throw new RemoteLibraryError(isAbort ? 'timeout' : 'network', msg);
        } finally{
            clearTimeout(timer);
        }
    }
    async connect(options) {
        const normalized = normalizeServerBaseUrl(options.baseUrl);
        if (!normalized) {
            const err = new RemoteLibraryError('invalid-url', 'Invalid LAN server URL (expected http://host:port)');
            this.setState('error', err.message);
            throw err;
        }
        this.baseUrl = normalized;
        this.setState('connecting', null);
        const infoRes = await this.fetchWithTimeout(`${normalized}/api/info`);
        if (!infoRes.ok) {
            const msg = `Unable to reach mPlay3r LAN server (HTTP ${infoRes.status})`;
            this.setState('error', msg);
            throw new RemoteLibraryError('http', msg, infoRes.status);
        }
        const info = await infoRes.json();
        let token = (options.token || '').trim();
        if (!token && options.pin) {
            const authRes = await this.fetchWithTimeout(`${normalized}/api/auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pin: options.pin.trim()
                })
            });
            if (authRes.status === 401) {
                this.setState('error', 'Invalid LAN PIN');
                throw new RemoteLibraryError('unauthorized', 'Invalid LAN PIN', 401);
            }
            if (!authRes.ok) {
                const msg = `LAN authentication failed (HTTP ${authRes.status})`;
                this.setState('error', msg);
                throw new RemoteLibraryError('http', msg, authRes.status);
            }
            const authData = await authRes.json();
            token = (authData.token || '').trim();
        }
        if (!token) {
            this.setState('error', 'A valid PIN or Bearer token is required');
            throw new RemoteLibraryError('unauthorized', 'A valid PIN or Bearer token is required', 401);
        }
        this.token = token;
        this.serverInfo = info;
        await this.listLibrary({
            page: 1,
            limit: 1
        });
        this.setState('connected', null);
        return {
            info,
            token
        };
    }
    disconnect() {
        this.baseUrl = null;
        this.token = '';
        this.serverInfo = null;
        this.setState('disconnected', null);
    }
    async ping() {
        if (!this.baseUrl || !this.token) {
            return false;
        }
        try {
            const res = await this.fetchWithTimeout(`${this.baseUrl}/api/info`);
            if (!res.ok) {
                this.setState('reconnecting', `Server returned HTTP ${res.status}`);
                return false;
            }
            this.serverInfo = await res.json();
            this.setState('connected', null);
            return true;
        } catch  {
            return false;
        }
    }
    async listLibrary(options = {}) {
        if (!this.baseUrl || !this.token) {
            throw new RemoteLibraryError('unauthorized', 'Not connected to a LAN server');
        }
        const safeFolder = sanitizeRelativeFolder(options.folder ?? '');
        if (safeFolder === null) {
            throw new RemoteLibraryError('invalid-url', 'Folder path contains forbidden traversal segments');
        }
        const page = Math.max(1, Math.floor(options.page ?? 1));
        const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)));
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit)
        });
        if (safeFolder) params.set('folder', safeFolder);
        if (options.query?.trim()) params.set('q', options.query.trim());
        const res = await this.fetchWithTimeout(`${this.baseUrl}/api/library?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });
        if (res.status === 401) {
            this.setState('error', 'Session expired or invalid token (HTTP 401)');
            throw new RemoteLibraryError('unauthorized', 'Unauthorized (HTTP 401)', 401);
        }
        if (!res.ok) {
            const msg = `Failed to load LAN library (HTTP ${res.status})`;
            this.setState('error', msg);
            throw new RemoteLibraryError('http', msg, res.status);
        }
        const data = await res.json();
        if (this.state === 'reconnecting') {
            this.setState('connected', null);
        }
        return data;
    }
    async listPlaylists() {
        if (!this.baseUrl || !this.token) {
            throw new RemoteLibraryError('unauthorized', 'Not connected to a LAN server');
        }
        const res = await this.fetchWithTimeout(`${this.baseUrl}/api/playlists`, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });
        if (res.status === 401) {
            this.setState('error', 'Session expired or invalid token (HTTP 401)');
            throw new RemoteLibraryError('unauthorized', 'Unauthorized (HTTP 401)', 401);
        }
        if (!res.ok) {
            const msg = `Failed to load LAN playlists (HTTP ${res.status})`;
            this.setState('error', msg);
            throw new RemoteLibraryError('http', msg, res.status);
        }
        const payload = await res.json();
        if (this.state === 'reconnecting') {
            this.setState('connected', null);
        }
        return Array.isArray(payload.playlists) ? payload.playlists : [];
    }
    getStreamUrl(trackId) {
        if (!this.baseUrl || !this.token) {
            throw new RemoteLibraryError('unauthorized', 'Not connected to a LAN server');
        }
        return `${this.baseUrl}/api/stream/${encodeURIComponent(trackId)}?token=${encodeURIComponent(this.token)}`;
    }
    trackToMediaItem(track) {
        return {
            id: `lan:${track.id}`,
            title: track.title,
            streamUrl: this.getStreamUrl(track.id),
            artist: this.serverInfo?.name || 'LAN Library',
            album: track.folder,
            providerId: 'mplay3r-lan-client'
        };
    }
}
class SavedServersStore {
    storage;
    servers = new Map();
    constructor(storage){
        this.storage = storage;
    }
    async load() {
        const raw = await this.storage.get(SAVED_SERVERS_STORAGE_KEY);
        this.servers.clear();
        if (Array.isArray(raw)) {
            for (const item of raw){
                if (item && typeof item.baseUrl === 'string' && typeof item.token === 'string') {
                    this.servers.set(item.baseUrl, item);
                }
            }
        }
        return this.list();
    }
    list() {
        return Array.from(this.servers.values());
    }
    async save(server) {
        const normalized = normalizeServerBaseUrl(server.baseUrl) ?? server.baseUrl;
        const record = {
            id: normalized,
            name: server.name || normalized,
            baseUrl: normalized,
            token: server.token,
            lastConnectedAt: new Date().toISOString()
        };
        this.servers.set(normalized, record);
        await this.storage.set(SAVED_SERVERS_STORAGE_KEY, this.list());
        return record;
    }
    async remove(baseUrl) {
        const existed = this.servers.delete(baseUrl);
        if (existed) {
            await this.storage.set(SAVED_SERVERS_STORAGE_KEY, this.list());
        }
        return existed;
    }
}
function createLanClientMediaSourceProvider(client) {
    return {
        id: 'mplay3r-lan-client',
        name: 'LAN Shared Library',
        async search (query, options) {
            if (client.getSnapshot().state !== 'connected') {
                return [];
            }
            const page = await client.listLibrary({
                query,
                page: 1,
                limit: options?.limit ?? 20
            });
            return page.tracks.map((t)=>client.trackToMediaItem(t));
        }
    };
}

const QR_VERSION_SPECS = [
    {
        version: 1,
        size: 21,
        dataCodewords: 19,
        ecPerBlock: 7,
        blocks: 1,
        alignCoord: null
    },
    {
        version: 2,
        size: 25,
        dataCodewords: 34,
        ecPerBlock: 10,
        blocks: 1,
        alignCoord: 18
    },
    {
        version: 3,
        size: 29,
        dataCodewords: 55,
        ecPerBlock: 15,
        blocks: 1,
        alignCoord: 22
    },
    {
        version: 4,
        size: 33,
        dataCodewords: 80,
        ecPerBlock: 20,
        blocks: 1,
        alignCoord: 26
    },
    {
        version: 5,
        size: 37,
        dataCodewords: 108,
        ecPerBlock: 26,
        blocks: 1,
        alignCoord: 30
    },
    {
        version: 6,
        size: 41,
        dataCodewords: 136,
        ecPerBlock: 18,
        blocks: 2,
        alignCoord: 34
    }
];
const QR_FORMAT_BITS_L = [
    0x77c4,
    0x72f3,
    0x7daa,
    0x789d,
    0x662f,
    0x6318,
    0x6c41,
    0x6976
];
function qrGfMultiply(a, b) {
    let result = 0;
    let x = a;
    let y = b;
    for(let i = 0; i < 8; i += 1){
        if ((y & 1) !== 0) result ^= x;
        const high = (x & 0x80) !== 0;
        x = x << 1 & 0xff;
        if (high) x ^= 0x1d;
        y >>= 1;
    }
    return result;
}
function qrReedSolomonGenerator(degree) {
    let poly = [
        1
    ];
    let root = 1;
    for(let i = 0; i < degree; i += 1){
        const next = new Array(poly.length + 1).fill(0);
        for(let j = 0; j < poly.length; j += 1){
            next[j] ^= poly[j];
            next[j + 1] ^= qrGfMultiply(poly[j], root);
        }
        poly = next;
        root = qrGfMultiply(root, 2);
    }
    return poly;
}
function qrComputeEcBytes(data, ecCount) {
    const gen = qrReedSolomonGenerator(ecCount);
    const rem = new Array(ecCount).fill(0);
    for (const byte of data){
        const factor = byte ^ rem[0];
        rem.shift();
        rem.push(0);
        for(let i = 0; i < ecCount; i += 1){
            rem[i] ^= qrGfMultiply(gen[i + 1], factor);
        }
    }
    return rem;
}
function qrMaskCondition(maskId, row, col) {
    switch(maskId){
        case 0:
            return (row + col) % 2 === 0;
        case 1:
            return row % 2 === 0;
        case 2:
            return col % 3 === 0;
        case 3:
            return (row + col) % 3 === 0;
        case 4:
            return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
        case 5:
            return row * col % 2 + row * col % 3 === 0;
        case 6:
            return (row * col % 2 + row * col % 3) % 2 === 0;
        default:
            return ((row + col) % 2 + row * col % 3) % 2 === 0;
    }
}
function qrPenaltyScore(modules) {
    const n = modules.length;
    let penalty = 0;
    let darkCount = 0;
    for(let r = 0; r < n; r += 1){
        let runColor = modules[r][0];
        let runLen = 1;
        if (runColor) darkCount += 1;
        for(let c = 1; c < n; c += 1){
            if (modules[r][c]) darkCount += 1;
            if (modules[r][c] === runColor) {
                runLen += 1;
            } else {
                if (runLen >= 5) penalty += 3 + (runLen - 5);
                runColor = modules[r][c];
                runLen = 1;
            }
        }
        if (runLen >= 5) penalty += 3 + (runLen - 5);
    }
    for(let c = 0; c < n; c += 1){
        let runColor = modules[0][c];
        let runLen = 1;
        for(let r = 1; r < n; r += 1){
            if (modules[r][c] === runColor) {
                runLen += 1;
            } else {
                if (runLen >= 5) penalty += 3 + (runLen - 5);
                runColor = modules[r][c];
                runLen = 1;
            }
        }
        if (runLen >= 5) penalty += 3 + (runLen - 5);
    }
    for(let r = 0; r < n - 1; r += 1){
        for(let c = 0; c < n - 1; c += 1){
            const val = modules[r][c];
            if (val === modules[r][c + 1] && val === modules[r + 1][c] && val === modules[r + 1][c + 1]) {
                penalty += 3;
            }
        }
    }
    const ratio = Math.abs(darkCount * 20 - n * n * 10);
    penalty += Math.floor(ratio / (n * n)) * 10;
    return penalty;
}
function qrApplyFormatBits(modules, maskId) {
    const n = modules.length;
    const bits = QR_FORMAT_BITS_L[maskId];
    for(let i = 0; i < 15; i += 1){
        const bit = (bits >> i & 1) === 1;
        if (i < 6) modules[i][8] = bit;
        else if (i < 8) modules[i + 1][8] = bit;
        else modules[n - 15 + i][8] = bit;
        if (i < 8) modules[8][n - 1 - i] = bit;
        else if (i === 8) modules[8][7] = bit;
        else modules[8][14 - i] = bit;
    }
}
function encodeQrMatrix(text) {
    const payload = new TextEncoder().encode(text);
    const spec = QR_VERSION_SPECS.find((s)=>payload.length + 2 <= s.dataCodewords);
    if (!spec) {
        throw new Error(`QR payload too long (${payload.length} bytes; max 134 bytes).`);
    }
    const bits = [];
    const pushBits = (val, width)=>{
        for(let i = width - 1; i >= 0; i -= 1){
            bits.push(val >> i & 1);
        }
    };
    pushBits(0b0100, 4);
    pushBits(payload.length, 8);
    for (const byte of payload){
        pushBits(byte, 8);
    }
    const capacityBits = spec.dataCodewords * 8;
    const terminator = Math.min(4, capacityBits - bits.length);
    for(let i = 0; i < terminator; i += 1)bits.push(0);
    while(bits.length % 8 !== 0)bits.push(0);
    const dataCodewords = [];
    for(let i = 0; i < bits.length; i += 8){
        let byte = 0;
        for(let b = 0; b < 8; b += 1)byte = byte << 1 | bits[i + b];
        dataCodewords.push(byte);
    }
    const padBytes = [
        0xec,
        0x11
    ];
    let padIdx = 0;
    while(dataCodewords.length < spec.dataCodewords){
        dataCodewords.push(padBytes[padIdx % 2]);
        padIdx += 1;
    }
    const blockSize = spec.dataCodewords / spec.blocks;
    const dataBlocks = [];
    const ecBlocks = [];
    for(let b = 0; b < spec.blocks; b += 1){
        const slice = dataCodewords.slice(b * blockSize, (b + 1) * blockSize);
        dataBlocks.push(slice);
        ecBlocks.push(qrComputeEcBytes(slice, spec.ecPerBlock));
    }
    const finalBytes = [];
    for(let i = 0; i < blockSize; i += 1){
        for(let b = 0; b < spec.blocks; b += 1)finalBytes.push(dataBlocks[b][i]);
    }
    for(let i = 0; i < spec.ecPerBlock; i += 1){
        for(let b = 0; b < spec.blocks; b += 1)finalBytes.push(ecBlocks[b][i]);
    }
    const n = spec.size;
    const base = Array.from({
        length: n
    }, ()=>new Array(n).fill(false));
    const isFunction = Array.from({
        length: n
    }, ()=>new Array(n).fill(false));
    const setFn = (r, c, dark)=>{
        if (r >= 0 && r < n && c >= 0 && c < n) {
            base[r][c] = dark;
            isFunction[r][c] = true;
        }
    };
    const drawFinder = (top, left)=>{
        for(let dr = -1; dr <= 7; dr += 1){
            for(let dc = -1; dc <= 7; dc += 1){
                const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
                setFn(top + dr, left + dc, dist !== 2 && dist !== 4);
            }
        }
    };
    drawFinder(0, 0);
    drawFinder(0, n - 7);
    drawFinder(n - 7, 0);
    for(let i = 8; i < n - 8; i += 1){
        setFn(6, i, i % 2 === 0);
        setFn(i, 6, i % 2 === 0);
    }
    if (spec.alignCoord !== null) {
        const center = spec.alignCoord;
        for(let dr = -2; dr <= 2; dr += 1){
            for(let dc = -2; dc <= 2; dc += 1){
                const dist = Math.max(Math.abs(dr), Math.abs(dc));
                setFn(center + dr, center + dc, dist !== 1);
            }
        }
    }
    for(let i = 0; i < 9; i += 1){
        if (!isFunction[8][i]) setFn(8, i, false);
        if (!isFunction[i][8]) setFn(i, 8, false);
    }
    for(let i = 0; i < 8; i += 1){
        setFn(8, n - 1 - i, false);
        setFn(n - 1 - i, 8, false);
    }
    setFn(4 * spec.version + 9, 8, true);
    const finalBits = [];
    for (const byte of finalBytes){
        for(let b = 7; b >= 0; b -= 1){
            finalBits.push((byte >> b & 1) === 1);
        }
    }
    let bitIndex = 0;
    let upward = true;
    for(let col = n - 1; col >= 1; col -= 2){
        if (col === 6) col -= 1;
        for(let step = 0; step < n; step += 1){
            const row = upward ? n - 1 - step : step;
            for(let offset = 0; offset < 2; offset += 1){
                const c = col - offset;
                if (!isFunction[row][c]) {
                    base[row][c] = bitIndex < finalBits.length ? finalBits[bitIndex] : false;
                    bitIndex += 1;
                }
            }
        }
        upward = !upward;
    }
    let bestModules = base;
    let bestScore = Number.POSITIVE_INFINITY;
    for(let maskId = 0; maskId < 8; maskId += 1){
        const candidate = base.map((row, r)=>row.map((val, c)=>isFunction[r][c] ? val : qrMaskCondition(maskId, r, c) ? !val : val));
        qrApplyFormatBits(candidate, maskId);
        const score = qrPenaltyScore(candidate);
        if (score < bestScore) {
            bestScore = score;
            bestModules = candidate;
        }
    }
    return {
        version: spec.version,
        size: n,
        modules: bestModules
    };
}
function renderQrCodeSvg(text, options = {}) {
    const { size, modules } = encodeQrMatrix(text);
    const quiet = 4;
    const viewSize = size + quiet * 2;
    const px = options.pixelSize ?? 168;
    const fg = options.fg ?? '#111827';
    const bg = options.bg ?? '#ffffff';
    const parts = [];
    for(let r = 0; r < size; r += 1){
        for(let c = 0; c < size; c += 1){
            if (modules[r][c]) {
                parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-label="LAN Share QR Code" shape-rendering="crispEdges">` + `<rect width="${viewSize}" height="${viewSize}" fill="${bg}"/>` + `<path d="${parts.join('')}" fill="${fg}"/>` + `</svg>`;
}

const HOST_CONFIG_STORAGE_KEY = 'lanHostConfig';
function createDefaultLanHostBridge() {
    const g = globalThis;
    if (g.__MPLAY3R_LAN_BRIDGE__) {
        return g.__MPLAY3R_LAN_BRIDGE__;
    }
    const invoke = g.__TAURI_INTERNALS__?.invoke;
    return {
        isSupported () {
            return typeof invoke === 'function';
        },
        async startServer (config) {
            if (typeof invoke !== 'function') {
                throw new Error('Local LAN TCP server requires mPlay3r Desktop or the standalone `mplay3r-lan-server` companion binary.');
            }
            const result = await invoke('start_lan_share_server', {
                config
            });
            return {
                url: result?.url || `http://127.0.0.1:${config.port}`
            };
        },
        async stopServer () {
            if (typeof invoke === 'function') {
                await invoke('stop_lan_share_server');
            }
        }
    };
}
class LanHostController {
    storage;
    bridge;
    config;
    running = false;
    activeUrl;
    lastError;
    constructor(storage, bridge = createDefaultLanHostBridge()){
        this.storage = storage;
        this.bridge = bridge;
        this.config = {
            serverName: 'mPlay3r LAN Library',
            port: 8765,
            bindAddress: '0.0.0.0',
            sharedFolders: [],
            pin: generateLanPin(6),
            bearerToken: generateBearerToken(24)
        };
    }
    async load() {
        const saved = await this.storage.get(HOST_CONFIG_STORAGE_KEY);
        if (saved && typeof saved === 'object') {
            if (typeof saved.serverName === 'string' && saved.serverName.trim()) {
                this.config.serverName = saved.serverName.trim();
            }
            if (typeof saved.port === 'number' && saved.port >= 1024 && saved.port <= 65535) {
                this.config.port = Math.floor(saved.port);
            }
            if (Array.isArray(saved.sharedFolders)) {
                this.config.sharedFolders = saved.sharedFolders.filter((f)=>typeof f === 'string' && f.trim().length > 0);
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
    async persist() {
        await this.storage.set(HOST_CONFIG_STORAGE_KEY, this.config);
    }
    getStatus() {
        return {
            running: this.running,
            supported: this.bridge.isSupported(),
            url: this.activeUrl,
            serverName: this.config.serverName,
            port: this.config.port,
            sharedFolders: [
                ...this.config.sharedFolders
            ],
            pin: this.config.pin,
            bearerToken: this.config.bearerToken,
            cliCommand: formatLanCompanionCommand(this.config),
            error: this.lastError
        };
    }
    async updateSettings(patch) {
        if (typeof patch.serverName === 'string' && patch.serverName.trim()) {
            this.config.serverName = patch.serverName.trim().slice(0, 64);
        }
        if (typeof patch.port === 'number' && Number.isFinite(patch.port)) {
            this.config.port = Math.min(65535, Math.max(1024, Math.floor(patch.port)));
        }
        await this.persist();
        return this.getStatus();
    }
    async addSharedFolder(folderPath) {
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
    async removeSharedFolder(folderPath) {
        this.config.sharedFolders = this.config.sharedFolders.filter((f)=>f !== folderPath);
        await this.persist();
        return this.getStatus();
    }
    async rotateCredentials() {
        this.config.pin = generateLanPin(6);
        this.config.bearerToken = generateBearerToken(24);
        await this.persist();
        return this.getStatus();
    }
    async start() {
        if (this.config.sharedFolders.length === 0) {
            this.lastError = 'Select at least one local music folder before starting LAN sharing.';
            throw new Error(this.lastError);
        }
        this.lastError = undefined;
        try {
            const started = await this.bridge.startServer({
                ...this.config,
                sharedFolders: [
                    ...this.config.sharedFolders
                ]
            });
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
    async stop() {
        try {
            await this.bridge.stopServer();
        } finally{
            this.running = false;
            this.activeUrl = undefined;
            this.lastError = undefined;
        }
        return this.getStatus();
    }
    getPairingQr(overrideBaseUrl) {
        const base = overrideBaseUrl || this.activeUrl || `http://localhost:${this.config.port}`;
        const connectUrl = buildShareConnectionUrl(base, {
            pin: this.config.pin
        });
        return {
            connectUrl,
            svg: renderQrCodeSvg(connectUrl, {
                pixelSize: 156
            })
        };
    }
}

export const manifest = {
    id: 'mplay3r.library-share',
    name: 'Local Library Share (LAN)',
    version: '1.0.0',
    description: 'Share selected local music folders over LAN with PIN/Bearer authentication, scannable QR code, embedded <mplay3r-app> web UI, HTTP 206 Range streaming, and a remote LAN client for Web & Desktop.',
    category: 'broadcast',
    permissions: [
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
let activeClient = null;
let activeHostController = null;
const LAN_INPUT_CSS = 'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.76rem';
const LAN_ROW_CSS = 'display:flex;align-items:center;justify-content:space-between;gap:0.45rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
const LAN_LIST_CSS = 'display:flex;flex-direction:column;gap:0.3rem;max-height:13rem;overflow-y:auto';
function lanEl(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}
function lanBtn(label, onClick, variant = 'ghost') {
    const styles = {
        ghost: 'padding:0.2rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer',
        accent: 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
        solid: 'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer'
    };
    const btn = lanEl('button', styles[variant], label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const fetcher = (input, init)=>ctx.fetch(input, init);
        const client = new RemoteLibraryClient(fetcher);
        const savedServers = new SavedServersStore(ctx.storage);
        const hostController = new LanHostController(ctx.storage);
        activeClient = client;
        activeHostController = hostController;
        await Promise.all([
            savedServers.load(),
            hostController.load()
        ]);
        ctx.registerProvider('media-source', createLanClientMediaSourceProvider(client));
        const playRemoteTracks = async (tracks, label)=>{
            if (tracks.length === 0) return;
            const serverName = client.getSnapshot().serverInfo?.name || 'LAN Library';
            await ctx.playlist.clearPlaylist();
            await ctx.playlist.addTracks(tracks.map((t)=>({
                    src: client.getStreamUrl(t.id),
                    title: t.title,
                    artist: serverName,
                    album: t.folder,
                    format: t.format
                })), true);
            await ctx.notify(`Streaming ${label}`, 'success');
        };
        ctx.registerSlot({
            id: 'library-share-panel',
            slot: 'panel',
            title: 'LAN Share',
            mount (container) {
                let activeTab = 'client';
                let serverUrlInput = '';
                let pinInputVal = '';
                let tokenInputVal = '';
                let folderFilter = '';
                let searchQuery = '';
                let currentPage = 1;
                let libraryPage = null;
                let playlists = [];
                let busy = false;
                let folderPathDraft = '';
                const loadRemoteView = async ()=>{
                    if (client.getSnapshot().state !== 'connected') {
                        libraryPage = null;
                        playlists = [];
                        renderPanel();
                        return;
                    }
                    busy = true;
                    renderPanel();
                    try {
                        const [pageData, plData] = await Promise.all([
                            client.listLibrary({
                                folder: folderFilter,
                                query: searchQuery,
                                page: currentPage,
                                limit: 25
                            }),
                            client.listPlaylists().catch(()=>[])
                        ]);
                        libraryPage = pageData;
                        playlists = plData;
                    } catch (err) {
                        await ctx.notify(err instanceof Error ? err.message : 'LAN library request failed', 'error');
                    } finally{
                        busy = false;
                        renderPanel();
                    }
                };
                const connectServer = async (baseUrl, pin, token)=>{
                    busy = true;
                    renderPanel();
                    try {
                        const { info, token: resolvedToken } = await client.connect({
                            baseUrl,
                            pin,
                            token
                        });
                        await savedServers.save({
                            baseUrl,
                            name: info.name,
                            token: resolvedToken
                        });
                        currentPage = 1;
                        folderFilter = '';
                        searchQuery = '';
                        pinInputVal = '';
                        await ctx.notify(`Connected to ${info.name}`, 'success');
                        await loadRemoteView();
                    } catch (err) {
                        await ctx.notify(err instanceof Error ? err.message : 'Unable to connect to LAN server', 'error');
                        busy = false;
                        renderPanel();
                    }
                };
                const renderClientTab = (wrap)=>{
                    const snap = client.getSnapshot();
                    if (snap.state !== 'connected') {
                        const form = lanEl('form', 'display:flex;flex-wrap:wrap;gap:0.35rem');
                        const urlField = lanEl('input', `${LAN_INPUT_CSS};flex:1 1 11rem`);
                        urlField.type = 'url';
                        urlField.placeholder = 'http://192.168.1.42:8765';
                        urlField.value = serverUrlInput;
                        urlField.addEventListener('input', ()=>{
                            serverUrlInput = urlField.value;
                        });
                        const pinField = lanEl('input', `${LAN_INPUT_CSS};width:6.5rem`);
                        pinField.type = 'password';
                        pinField.placeholder = 'PIN';
                        pinField.value = pinInputVal;
                        pinField.addEventListener('input', ()=>{
                            pinInputVal = pinField.value;
                        });
                        const tokField = lanEl('input', `${LAN_INPUT_CSS};flex:1 1 8rem`);
                        tokField.type = 'password';
                        tokField.placeholder = 'or Bearer token';
                        tokField.value = tokenInputVal;
                        tokField.addEventListener('input', ()=>{
                            tokenInputVal = tokField.value;
                        });
                        const submitBtn = lanEl('button', 'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer', busy ? '…' : 'Connect');
                        submitBtn.type = 'submit';
                        form.addEventListener('submit', (e)=>{
                            e.preventDefault();
                            void connectServer(serverUrlInput, pinInputVal || undefined, tokenInputVal || undefined);
                        });
                        form.append(urlField, pinField, tokField, submitBtn);
                        wrap.append(form);
                        if (snap.lastError) {
                            const errRow = lanEl('div', 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem');
                            errRow.append(lanEl('span', 'font-size:0.72rem;color:var(--mp-text-muted)', snap.lastError));
                            if (snap.state === 'reconnecting') {
                                errRow.append(lanBtn('Retry', ()=>{
                                    void client.ping().then((ok)=>{
                                        if (ok) void loadRemoteView();
                                        else renderPanel();
                                    });
                                }, 'accent'));
                            }
                            wrap.append(errRow);
                        }
                        const saved = savedServers.list();
                        if (saved.length > 0) {
                            const list = lanEl('div', LAN_LIST_CSS);
                            for (const srv of saved){
                                const row = lanEl('div', LAN_ROW_CSS);
                                const meta = lanEl('div', 'min-width:0;flex:1');
                                meta.append(lanEl('div', 'font-size:0.78rem;font-weight:600', srv.name), lanEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', srv.baseUrl));
                                const btns = lanEl('div', 'display:flex;gap:0.25rem');
                                btns.append(lanBtn('✕', ()=>void savedServers.remove(srv.baseUrl).then(()=>renderPanel())), lanBtn('Connect', ()=>void connectServer(srv.baseUrl, undefined, srv.token), 'accent'));
                                row.append(meta, btns);
                                list.append(row);
                            }
                            wrap.append(list);
                        }
                        return;
                    }
                    const statusRow = lanEl('div', LAN_ROW_CSS);
                    const infoBox = lanEl('div', 'min-width:0;flex:1');
                    infoBox.append(lanEl('div', 'font-size:0.8rem;font-weight:700', snap.serverInfo?.name || 'Connected LAN Server'), lanEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', `${snap.baseUrl || ''} · ${snap.serverInfo?.trackCount ?? 0} tracks`));
                    statusRow.append(infoBox, lanBtn('Disconnect', ()=>{
                        client.disconnect();
                        libraryPage = null;
                        playlists = [];
                        renderPanel();
                    }));
                    wrap.append(statusRow);
                    const filterBar = lanEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem');
                    const folderSel = lanEl('select', LAN_INPUT_CSS);
                    folderSel.setAttribute('aria-label', 'Remote shared folder');
                    const allOpt = document.createElement('option');
                    allOpt.value = '';
                    allOpt.textContent = 'All folders';
                    allOpt.selected = folderFilter === '';
                    folderSel.append(allOpt);
                    for (const folder of libraryPage?.folders ?? []){
                        const opt = document.createElement('option');
                        opt.value = folder;
                        opt.textContent = folder;
                        opt.selected = folder === folderFilter;
                        folderSel.append(opt);
                    }
                    folderSel.addEventListener('change', ()=>{
                        folderFilter = folderSel.value;
                        currentPage = 1;
                        void loadRemoteView();
                    });
                    const qInput = lanEl('input', `${LAN_INPUT_CSS};flex:1 1 8rem`);
                    qInput.type = 'search';
                    qInput.placeholder = 'Search remote tracks…';
                    qInput.value = searchQuery;
                    qInput.addEventListener('input', ()=>{
                        searchQuery = qInput.value;
                    });
                    qInput.addEventListener('keydown', (e)=>{
                        if (e.key === 'Enter') {
                            currentPage = 1;
                            void loadRemoteView();
                        }
                    });
                    filterBar.append(folderSel, qInput, lanBtn(busy ? '…' : 'Search', ()=>{
                        currentPage = 1;
                        void loadRemoteView();
                    }, 'solid'));
                    wrap.append(filterBar);
                    if (playlists.length > 0) {
                        const plRow = lanEl('div', 'display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center');
                        plRow.append(lanEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', 'Playlists:'));
                        for (const pl of playlists){
                            plRow.append(lanBtn(`${pl.name} (${pl.trackCount})`, ()=>void playRemoteTracks(pl.tracks, pl.name), 'accent'));
                        }
                        wrap.append(plRow);
                    }
                    const list = lanEl('div', LAN_LIST_CSS);
                    const tracks = libraryPage?.tracks ?? [];
                    if (tracks.length === 0) {
                        list.append(lanEl('p', 'margin:0.3rem 0;font-size:0.75rem;color:var(--mp-text-muted)', 'No tracks found.'));
                    } else {
                        for (const track of tracks){
                            const row = lanEl('div', LAN_ROW_CSS);
                            const meta = lanEl('div', 'min-width:0;flex:1');
                            meta.append(lanEl('div', 'font-size:0.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', track.title), lanEl('div', 'font-size:0.68rem;color:var(--mp-text-muted)', `${track.folder} · ${track.format}`));
                            row.append(meta, lanBtn('Play', ()=>void playRemoteTracks([
                                    track
                                ], track.title), 'accent'));
                            list.append(row);
                        }
                    }
                    wrap.append(list);
                    if (libraryPage && libraryPage.totalPages > 1) {
                        const pager = lanEl('div', 'display:flex;align-items:center;justify-content:space-between;font-size:0.72rem');
                        const prevBtn = lanBtn('← Prev', ()=>{
                            if (currentPage > 1) {
                                currentPage -= 1;
                                void loadRemoteView();
                            }
                        });
                        prevBtn.disabled = currentPage <= 1;
                        const nextBtn = lanBtn('Next →', ()=>{
                            if (libraryPage && currentPage < libraryPage.totalPages) {
                                currentPage += 1;
                                void loadRemoteView();
                            }
                        });
                        nextBtn.disabled = currentPage >= libraryPage.totalPages;
                        pager.append(prevBtn, lanEl('span', 'color:var(--mp-text-muted)', `Page ${libraryPage.page}/${libraryPage.totalPages}`), nextBtn);
                        wrap.append(pager);
                    }
                };
                const renderHostTab = (wrap)=>{
                    const st = hostController.getStatus();
                    const folderForm = lanEl('form', 'display:flex;gap:0.35rem');
                    const pathInput = lanEl('input', `${LAN_INPUT_CSS};flex:1`);
                    pathInput.type = 'text';
                    pathInput.placeholder = 'Add allowlisted folder path (e.g. /home/user/Music)';
                    pathInput.value = folderPathDraft;
                    pathInput.addEventListener('input', ()=>{
                        folderPathDraft = pathInput.value;
                    });
                    const addBtn = lanEl('button', `${LAN_INPUT_CSS};cursor:pointer`, '+ Folder');
                    addBtn.type = 'submit';
                    folderForm.addEventListener('submit', (e)=>{
                        e.preventDefault();
                        const val = folderPathDraft.trim();
                        if (!val) return;
                        folderPathDraft = '';
                        void hostController.addSharedFolder(val).then(()=>renderPanel()).catch((err)=>ctx.notify(err instanceof Error ? err.message : 'Invalid folder', 'error'));
                    });
                    folderForm.append(pathInput, addBtn);
                    wrap.append(folderForm);
                    const folderList = lanEl('div', 'display:flex;flex-direction:column;gap:0.25rem');
                    if (st.sharedFolders.length === 0) {
                        folderList.append(lanEl('div', 'font-size:0.73rem;color:var(--mp-text-muted)', 'No folders shared yet. Only explicitly allowlisted folders are ever exposed.'));
                    } else {
                        for (const dir of st.sharedFolders){
                            const row = lanEl('div', LAN_ROW_CSS);
                            row.append(lanEl('span', 'font-size:0.74rem;overflow:hidden;text-overflow:ellipsis', dir), lanBtn('Remove', ()=>void hostController.removeSharedFolder(dir).then(()=>renderPanel())));
                            folderList.append(row);
                        }
                    }
                    wrap.append(folderList);
                    const ctrlRow = lanEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center');
                    ctrlRow.append(lanBtn(st.running ? 'Stop LAN Server' : 'Start LAN Server', ()=>{
                        if (st.running) {
                            void hostController.stop().then(()=>renderPanel());
                        } else {
                            void hostController.start().then(()=>ctx.notify('LAN Library Share server started', 'success')).catch((err)=>ctx.notify(err instanceof Error ? err.message : 'Start failed', 'error')).finally(()=>renderPanel());
                        }
                    }, st.running ? 'accent' : 'solid'), lanBtn('Rotate PIN', ()=>void hostController.rotateCredentials().then(()=>renderPanel())), lanEl('span', 'font-size:0.74rem;font-weight:700', `PIN: ${st.pin}`));
                    wrap.append(ctrlRow);
                    const qr = hostController.getPairingQr();
                    const qrBox = lanEl('div', 'display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;padding:0.45rem;border:1px solid var(--mp-border);border-radius:6px;background:var(--mp-bg)');
                    const qrImg = lanEl('div', 'line-height:0;border-radius:6px;overflow:hidden');
                    qrImg.innerHTML = qr.svg;
                    const qrMeta = lanEl('div', 'flex:1;min-width:10rem;display:flex;flex-direction:column;gap:0.25rem;font-size:0.72rem');
                    qrMeta.append(lanEl('div', 'font-weight:600', st.running ? `Live at ${st.url}` : 'Quick-connect QR (LAN)'), lanEl('div', 'color:var(--mp-text-muted);word-break:break-all', qr.connectUrl));
                    if (!st.supported && st.cliCommand) {
                        qrMeta.append(lanEl('code', 'font-size:0.67rem;padding:0.25rem 0.35rem;border-radius:4px;border:1px solid var(--mp-border);word-break:break-all', st.cliCommand));
                    }
                    qrBox.append(qrImg, qrMeta);
                    wrap.append(qrBox);
                };
                const renderPanel = ()=>{
                    container.innerHTML = '';
                    const wrap = lanEl('div', 'display:flex;flex-direction:column;gap:0.5rem');
                    const tabs = lanEl('div', 'display:flex;gap:0.35rem');
                    tabs.append(lanBtn('Remote Client', ()=>{
                        activeTab = 'client';
                        renderPanel();
                    }, activeTab === 'client' ? 'solid' : 'ghost'), lanBtn('Share Local Library', ()=>{
                        activeTab = 'host';
                        renderPanel();
                    }, activeTab === 'host' ? 'solid' : 'ghost'));
                    wrap.append(tabs);
                    if (activeTab === 'client') {
                        renderClientTab(wrap);
                    } else {
                        renderHostTab(wrap);
                    }
                    container.append(wrap);
                };
                const unsub = client.onStateChange(()=>renderPanel());
                renderPanel();
                return ()=>{
                    unsub();
                    container.innerHTML = '';
                };
            }
        });
    },
    async deactivate () {
        activeClient?.disconnect();
        activeClient = null;
        if (activeHostController?.getStatus().running) {
            await activeHostController.stop().catch(()=>undefined);
        }
        activeHostController = null;
    }
};
export default plugin;
