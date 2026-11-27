// mPlay3r addon bundle: mplay3r.source-subsonic@1.0.0 (generated from plugins/source-subsonic/src)

const MD5_SHIFTS = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
];
const MD5_K = Array.from({
    length: 64
}, (_, i)=>Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
function md5Rotl(x, n) {
    return (x << n | x >>> 32 - n) >>> 0;
}
function md5WordToHexLE(word) {
    let out = '';
    for(let i = 0; i < 4; i += 1){
        out += (word >>> i * 8 & 0xff).toString(16).padStart(2, '0');
    }
    return out;
}
function md5Hex(input) {
    const bytes = new TextEncoder().encode(input);
    const bitLen = bytes.length * 8;
    const paddedLen = (bytes.length + 8 >> 6) + 1 << 6;
    const padded = new Uint8Array(paddedLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLen - 8, bitLen >>> 0, true);
    view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const m = new Uint32Array(16);
    for(let offset = 0; offset < paddedLen; offset += 64){
        for(let j = 0; j < 16; j += 1){
            m[j] = view.getUint32(offset + j * 4, true);
        }
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for(let i = 0; i < 64; i += 1){
            let f;
            let g;
            if (i < 16) {
                f = b & c | ~b & d;
                g = i;
            } else if (i < 32) {
                f = d & b | ~d & c;
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = 7 * i % 16;
            }
            const nextD = c;
            const nextC = b;
            const sum = a + f + MD5_K[i] + m[g] >>> 0;
            const nextB = b + md5Rotl(sum, MD5_SHIFTS[i]) >>> 0;
            a = d;
            b = nextB;
            c = nextC;
            d = nextD;
        }
        a0 = a0 + a >>> 0;
        b0 = b0 + b >>> 0;
        c0 = c0 + c >>> 0;
        d0 = d0 + d >>> 0;
    }
    return md5WordToHexLE(a0) + md5WordToHexLE(b0) + md5WordToHexLE(c0) + md5WordToHexLE(d0);
}

const SUBSONIC_PROVIDER_ID = 'mplay3r-subsonic';
const DEFAULT_SUBSONIC_API_VERSION = '1.16.1';
const DEFAULT_SUBSONIC_CLIENT = 'mPlay3r';
function normalizeSubsonicUrl(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:\/|$))/i.test(trimmed);
    const withScheme = hasExplicitScheme ? trimmed : `https://${trimmed}`;
    try {
        const parsed = new URL(withScheme);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        const cleanPath = parsed.pathname.replace(/\/rest\/?$/i, '').replace(/\/+$/, '');
        return `${parsed.origin}${cleanPath}`;
    } catch  {
        return null;
    }
}
function generateSubsonicSalt(length = 12) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(Math.max(6, length));
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for(let i = 0; i < bytes.length; i += 1)bytes[i] = Math.floor(Math.random() * 256);
    }
    let salt = '';
    for (const b of bytes)salt += alphabet[b % alphabet.length];
    return salt;
}
function buildSubsonicQuery(config, extra = {}, fixedSalt) {
    const salt = fixedSalt || generateSubsonicSalt(12);
    const token = md5Hex(`${config.password}${salt}`);
    const params = new URLSearchParams({
        u: config.username.trim(),
        t: token,
        s: salt,
        v: config.apiVersion || DEFAULT_SUBSONIC_API_VERSION,
        c: config.clientName || DEFAULT_SUBSONIC_CLIENT,
        f: 'json'
    });
    for (const [key, val] of Object.entries(extra)){
        if (val !== undefined && val !== '') {
            params.set(key, String(val));
        }
    }
    return params;
}
class SubsonicClient {
    fetcher;
    config = null;
    constructor(fetcher, initialConfig){
        this.fetcher = fetcher;
        if (initialConfig) {
            this.configure(initialConfig);
        }
    }
    configure(config) {
        const normalized = normalizeSubsonicUrl(config.baseUrl);
        if (!normalized) {
            throw new Error('Invalid Subsonic / Navidrome server URL (expected http:// or https://).');
        }
        if (!config.username?.trim() || !config.password) {
            throw new Error('Subsonic username and password are required.');
        }
        this.config = {
            ...config,
            baseUrl: normalized,
            username: config.username.trim()
        };
        return {
            ...this.config
        };
    }
    clearConfig() {
        this.config = null;
    }
    getConfig() {
        return this.config ? {
            ...this.config
        } : null;
    }
    isConfigured() {
        return this.config !== null;
    }
    requireConfig() {
        if (!this.config) {
            throw new Error('Subsonic / Navidrome server is not configured.');
        }
        return this.config;
    }
    async request(endpoint, extra = {}) {
        const cfg = this.requireConfig();
        const params = buildSubsonicQuery(cfg, extra);
        const res = await this.fetcher(`${cfg.baseUrl}/rest/${endpoint}.view?${params.toString()}`, {
            headers: {
                Accept: 'application/json'
            }
        });
        if (!res.ok) {
            throw new Error(`Subsonic server error (HTTP ${res.status})`);
        }
        const envelope = await res.json();
        const body = envelope['subsonic-response'];
        if (!body) {
            throw new Error('Invalid Subsonic JSON response envelope.');
        }
        if (body.status === 'failed') {
            const code = body.error?.code;
            const msg = body.error?.message || 'Subsonic request failed';
            throw new Error(code !== undefined ? `Subsonic error ${code}: ${msg}` : msg);
        }
        return body;
    }
    async ping() {
        try {
            const body = await this.request('ping');
            return {
                ok: true,
                serverVersion: body.version,
                serverType: body.type,
                openSubsonic: Boolean(body.openSubsonic)
            };
        } catch (err) {
            return {
                ok: false,
                errorMessage: err instanceof Error ? err.message : 'Unable to reach Subsonic server.'
            };
        }
    }
    async searchSongs(query, limit = 25) {
        const body = await this.request('search3', {
            query: query.trim(),
            songCount: Math.min(100, Math.max(1, limit)),
            albumCount: 0,
            artistCount: 0
        });
        return Array.isArray(body.searchResult3?.song) ? body.searchResult3.song : [];
    }
    async getPlaylists() {
        const body = await this.request('getPlaylists');
        return Array.isArray(body.playlists?.playlist) ? body.playlists.playlist : [];
    }
    async getPlaylistSongs(playlistId) {
        const body = await this.request('getPlaylist', {
            id: playlistId
        });
        return Array.isArray(body.playlist?.entry) ? body.playlist.entry : [];
    }
    async getRandomSongs(size = 20) {
        const body = await this.request('getRandomSongs', {
            size: Math.min(100, Math.max(1, size))
        });
        return Array.isArray(body.randomSongs?.song) ? body.randomSongs.song : [];
    }
    getStreamUrl(songId, fixedSalt) {
        const cfg = this.requireConfig();
        const params = buildSubsonicQuery(cfg, {
            id: songId,
            maxBitRate: cfg.maxBitRate && cfg.maxBitRate > 0 ? cfg.maxBitRate : undefined
        }, fixedSalt);
        return `${cfg.baseUrl}/rest/stream.view?${params.toString()}`;
    }
    getCoverArtUrl(coverArtId, size = 300, fixedSalt) {
        const cfg = this.requireConfig();
        const params = buildSubsonicQuery(cfg, {
            id: coverArtId,
            size
        }, fixedSalt);
        return `${cfg.baseUrl}/rest/getCoverArt.view?${params.toString()}`;
    }
    songToMediaItem(song) {
        return {
            id: `subsonic:${song.id}`,
            title: song.title,
            streamUrl: this.getStreamUrl(song.id),
            artist: song.artist,
            album: song.album,
            duration: song.duration,
            artworkUrl: song.coverArt ? this.getCoverArtUrl(song.coverArt, 300) : undefined,
            providerId: SUBSONIC_PROVIDER_ID
        };
    }
}
function createSubsonicMediaSourceProvider(client) {
    return {
        id: SUBSONIC_PROVIDER_ID,
        name: 'Subsonic / Navidrome',
        async search (query, options) {
            if (!client.isConfigured()) return [];
            const songs = query.trim() ? await client.searchSongs(query, options?.limit ?? 20) : await client.getRandomSongs(options?.limit ?? 20);
            return songs.map((song)=>client.songToMediaItem(song));
        }
    };
}

export const manifest = {
    id: 'mplay3r.source-subsonic',
    name: 'Subsonic & Navidrome Connector',
    version: '1.0.0',
    description: 'Connect to self-hosted Subsonic, OpenSubsonic, Navidrome, or Airsonic servers using salted MD5 token authentication, search songs/playlists, play random mixes, and expose a MediaSourceProvider.',
    category: 'source',
    permissions: [
        'network',
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
const SUBSONIC_CONFIG_KEY = 'subsonicConfig';
const SUB_INPUT_CSS = 'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.75rem';
const SUB_ROW_CSS = 'display:flex;align-items:center;justify-content:space-between;gap:0.45rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
function subEl(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}
function subBtn(label, onClick, variant = 'ghost') {
    const styles = {
        ghost: 'padding:0.2rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer',
        accent: 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
        solid: 'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer'
    };
    const btn = subEl('button', styles[variant], label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const client = new SubsonicClient((input, init)=>ctx.fetch(input, init));
        const saved = await ctx.storage.get(SUBSONIC_CONFIG_KEY);
        if (saved && typeof saved.baseUrl === 'string' && saved.username && saved.password) {
            try {
                client.configure(saved);
            } catch  {}
        }
        ctx.registerProvider('media-source', createSubsonicMediaSourceProvider(client));
        const playSongs = async (songs, label)=>{
            if (songs.length === 0) return;
            await ctx.playlist.clearPlaylist();
            await ctx.playlist.addTracks(songs.map((s)=>({
                    src: client.getStreamUrl(s.id),
                    title: s.title,
                    artist: s.artist,
                    album: s.album,
                    duration: s.duration,
                    format: s.suffix ? s.suffix.toUpperCase() : 'STREAM'
                })), true);
            await ctx.notify(`Streaming ${label}`, 'success');
        };
        ctx.registerSlot({
            id: 'subsonic-panel',
            slot: 'panel',
            title: 'Subsonic',
            mount (container) {
                let urlDraft = client.getConfig()?.baseUrl || '';
                let userDraft = client.getConfig()?.username || '';
                let passDraft = '';
                let queryDraft = '';
                let statusLine = '';
                let songs = [];
                let playlists = [];
                let busy = false;
                const refreshPlaylists = async ()=>{
                    if (!client.isConfigured()) return;
                    try {
                        playlists = await client.getPlaylists();
                    } catch  {
                        playlists = [];
                    }
                };
                const runSearch = async (random = false)=>{
                    if (!client.isConfigured()) return;
                    busy = true;
                    render();
                    try {
                        songs = random || !queryDraft.trim() ? await client.getRandomSongs(20) : await client.searchSongs(queryDraft, 25);
                        statusLine = songs.length === 0 ? 'No matching tracks found.' : `${songs.length} track(s)`;
                    } catch (err) {
                        statusLine = err instanceof Error ? err.message : 'Subsonic search failed.';
                        await ctx.notify(statusLine, 'error');
                    } finally{
                        busy = false;
                        render();
                    }
                };
                const render = ()=>{
                    container.innerHTML = '';
                    const wrap = subEl('div', 'display:flex;flex-direction:column;gap:0.45rem');
                    const cfg = client.getConfig();
                    if (!cfg) {
                        const form = subEl('form', 'display:flex;flex-wrap:wrap;gap:0.35rem');
                        const uIn = subEl('input', `${SUB_INPUT_CSS};flex:1 1 11rem`);
                        uIn.type = 'url';
                        uIn.placeholder = 'https://navidrome.example.com';
                        uIn.value = urlDraft;
                        uIn.addEventListener('input', ()=>{
                            urlDraft = uIn.value;
                        });
                        const userIn = subEl('input', `${SUB_INPUT_CSS};width:7rem`);
                        userIn.placeholder = 'Username';
                        userIn.value = userDraft;
                        userIn.addEventListener('input', ()=>{
                            userDraft = userIn.value;
                        });
                        const passIn = subEl('input', `${SUB_INPUT_CSS};width:7rem`);
                        passIn.type = 'password';
                        passIn.placeholder = 'Password';
                        passIn.value = passDraft;
                        passIn.addEventListener('input', ()=>{
                            passDraft = passIn.value;
                        });
                        const connectBtn = subEl('button', 'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer', busy ? '…' : 'Connect');
                        connectBtn.type = 'submit';
                        form.addEventListener('submit', (event)=>{
                            event.preventDefault();
                            void (async ()=>{
                                busy = true;
                                render();
                                try {
                                    const nextCfg = client.configure({
                                        baseUrl: urlDraft,
                                        username: userDraft,
                                        password: passDraft
                                    });
                                    const ping = await client.ping();
                                    if (!ping.ok) {
                                        client.clearConfig();
                                        throw new Error(ping.errorMessage || 'Authentication failed');
                                    }
                                    await ctx.storage.set(SUBSONIC_CONFIG_KEY, nextCfg);
                                    passDraft = '';
                                    statusLine = `Connected (${ping.serverType || 'Subsonic'} ${ping.serverVersion || ''})`.trim();
                                    await refreshPlaylists();
                                    await runSearch(true);
                                } catch (err) {
                                    statusLine = err instanceof Error ? err.message : 'Connection failed.';
                                    await ctx.notify(statusLine, 'error');
                                    busy = false;
                                    render();
                                }
                            })();
                        });
                        form.append(uIn, userIn, passIn, connectBtn);
                        wrap.append(form);
                        if (statusLine) {
                            wrap.append(subEl('div', 'font-size:0.72rem;color:var(--mp-text-muted)', statusLine));
                        }
                        container.append(wrap);
                        return;
                    }
                    const head = subEl('div', SUB_ROW_CSS);
                    const info = subEl('div', 'min-width:0;flex:1');
                    info.append(subEl('div', 'font-size:0.79rem;font-weight:700', `${cfg.username}@${new URL(cfg.baseUrl).host}`), subEl('div', 'font-size:0.68rem;color:var(--mp-text-muted)', statusLine || 'Subsonic / Navidrome connected'));
                    head.append(info, subBtn('Disconnect', ()=>{
                        client.clearConfig();
                        songs = [];
                        playlists = [];
                        statusLine = '';
                        void ctx.storage.remove(SUBSONIC_CONFIG_KEY).then(()=>render());
                    }));
                    wrap.append(head);
                    const searchBar = subEl('div', 'display:flex;gap:0.35rem;flex-wrap:wrap');
                    const qIn = subEl('input', `${SUB_INPUT_CSS};flex:1 1 8rem`);
                    qIn.type = 'search';
                    qIn.placeholder = 'Search Navidrome / Subsonic…';
                    qIn.value = queryDraft;
                    qIn.addEventListener('input', ()=>{
                        queryDraft = qIn.value;
                    });
                    qIn.addEventListener('keydown', (e)=>{
                        if (e.key === 'Enter') void runSearch(false);
                    });
                    searchBar.append(qIn, subBtn(busy ? '…' : 'Search', ()=>void runSearch(false), 'solid'), subBtn('Random Mix', ()=>void runSearch(true), 'accent'));
                    wrap.append(searchBar);
                    if (playlists.length > 0) {
                        const plRow = subEl('div', 'display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center');
                        plRow.append(subEl('span', 'font-size:0.69rem;color:var(--mp-text-muted)', 'Playlists:'));
                        for (const pl of playlists.slice(0, 12)){
                            plRow.append(subBtn(`${pl.name} (${pl.songCount})`, ()=>{
                                void client.getPlaylistSongs(pl.id).then((items)=>playSongs(items, pl.name)).catch((err)=>ctx.notify(err instanceof Error ? err.message : 'Playlist error', 'error'));
                            }, 'accent'));
                        }
                        wrap.append(plRow);
                    }
                    const list = subEl('div', 'display:flex;flex-direction:column;gap:0.28rem;max-height:13rem;overflow-y:auto');
                    for (const song of songs){
                        const row = subEl('div', SUB_ROW_CSS);
                        const meta = subEl('div', 'min-width:0;flex:1');
                        meta.append(subEl('div', 'font-size:0.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', song.title), subEl('div', 'font-size:0.68rem;color:var(--mp-text-muted)', [
                            song.artist,
                            song.album,
                            song.suffix?.toUpperCase()
                        ].filter(Boolean).join(' · ')));
                        row.append(meta, subBtn('Play', ()=>void playSongs([
                                song
                            ], song.title), 'accent'));
                        list.append(row);
                    }
                    wrap.append(list);
                    container.append(wrap);
                };
                render();
                if (client.isConfigured()) {
                    void refreshPlaylists().then(()=>runSearch(true));
                }
                return ()=>{
                    container.innerHTML = '';
                };
            }
        });
    }
};
export default plugin;
