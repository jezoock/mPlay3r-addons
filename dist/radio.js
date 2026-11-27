// mPlay3r addon bundle: mplay3r.radio@1.0.0 (generated from plugins/radio/src)

function parseIcyMetadata(raw) {
    const cleaned = raw.split('\u0000')[0].trim();
    if (!cleaned) {
        return {};
    }
    const titleMatch = cleaned.match(/StreamTitle='([^']*)'/i);
    const urlMatch = cleaned.match(/StreamUrl='([^']*)'/i);
    const streamTitle = titleMatch?.[1]?.trim() || undefined;
    const streamUrl = urlMatch?.[1]?.trim() || undefined;
    if (!streamTitle) {
        return streamUrl ? {
            streamUrl
        } : {};
    }
    const splitMatch = streamTitle.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (splitMatch) {
        return {
            streamTitle,
            artist: splitMatch[1].trim(),
            title: splitMatch[2].trim(),
            ...streamUrl ? {
                streamUrl
            } : {}
        };
    }
    return {
        streamTitle,
        title: streamTitle,
        ...streamUrl ? {
            streamUrl
        } : {}
    };
}
function extractIcyFromChunk(chunk, metaInt) {
    if (metaInt <= 0 || chunk.byteLength <= metaInt) {
        return null;
    }
    const metaBlocks = chunk[metaInt];
    if (metaBlocks === 0) {
        return {};
    }
    const metaLen = metaBlocks * 16;
    const start = metaInt + 1;
    const end = Math.min(chunk.byteLength, start + metaLen);
    const text = new TextDecoder('utf-8').decode(chunk.subarray(start, end));
    return parseIcyMetadata(text);
}
function isHlsStreamUrl(url) {
    try {
        const parsed = new URL(url);
        return /\.m3u8$/i.test(parsed.pathname) || parsed.pathname.toLowerCase().includes('/hls/');
    } catch  {
        return /\.m3u8(?:\?|$)/i.test(url);
    }
}
function parseHlsMasterPlaylist(content, baseUrl) {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    const variants = [];
    let pendingBandwidth = 0;
    let pendingCodecs;
    let expectingUri = false;
    for (const rawLine of lines){
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            const codecMatch = line.match(/CODECS="([^"]+)"/i);
            pendingBandwidth = bwMatch ? Number(bwMatch[1]) : 0;
            pendingCodecs = codecMatch?.[1];
            expectingUri = true;
            continue;
        }
        if (line.startsWith('#')) {
            continue;
        }
        if (expectingUri) {
            try {
                const resolved = new URL(line, baseUrl).href;
                variants.push({
                    url: resolved,
                    bandwidth: pendingBandwidth,
                    ...pendingCodecs ? {
                        codecs: pendingCodecs
                    } : {}
                });
            } catch  {}
            expectingUri = false;
            pendingBandwidth = 0;
            pendingCodecs = undefined;
        }
    }
    return variants.sort((a, b)=>b.bandwidth - a.bandwidth);
}

const FAVORITES_STORAGE_KEY = 'favorites';
function computeReconnectDelayMs(attempt, options = {}) {
    const baseMs = options.baseMs ?? 1500;
    const maxMs = options.maxMs ?? 30_000;
    const maxAttempts = options.maxAttempts ?? 5;
    if (attempt < 0 || attempt >= maxAttempts) {
        return null;
    }
    return Math.min(maxMs, baseMs * 2 ** attempt);
}
class LiveStreamTracker {
    state = {
        isLive: false,
        seekDisabled: false,
        station: null,
        trackId: null,
        reconnecting: false,
        reconnectAttempt: 0
    };
    knownLiveStreams = new Map();
    registerLiveStation(station) {
        this.knownLiveStreams.set(station.streamUrl, station);
    }
    onTrackChanged(track) {
        if (!track) {
            return this.clear();
        }
        const station = this.knownLiveStreams.get(track.src) ?? null;
        if (!station) {
            return this.clear();
        }
        this.state = {
            isLive: true,
            seekDisabled: true,
            station,
            trackId: track.id,
            nowPlaying: undefined,
            reconnecting: false,
            reconnectAttempt: 0
        };
        return this.getState();
    }
    applyIcyMetadata(meta) {
        if (!this.state.isLive || !meta.streamTitle) {
            return this.getState();
        }
        this.state = {
            ...this.state,
            nowPlaying: meta.streamTitle
        };
        return this.getState();
    }
    scheduleReconnect(options) {
        if (!this.state.isLive) {
            return null;
        }
        const delay = computeReconnectDelayMs(this.state.reconnectAttempt, options);
        if (delay === null) {
            this.state = {
                ...this.state,
                reconnecting: false
            };
            return null;
        }
        this.state = {
            ...this.state,
            reconnecting: true,
            reconnectAttempt: this.state.reconnectAttempt + 1
        };
        return delay;
    }
    markRecovered() {
        this.state = {
            ...this.state,
            reconnecting: false,
            reconnectAttempt: 0
        };
        return this.getState();
    }
    clear() {
        this.state = {
            isLive: false,
            seekDisabled: false,
            station: null,
            trackId: null,
            nowPlaying: undefined,
            reconnecting: false,
            reconnectAttempt: 0
        };
        return this.getState();
    }
    getState() {
        return {
            ...this.state
        };
    }
}
class RadioFavoritesStore {
    storage;
    stations = new Map();
    constructor(storage){
        this.storage = storage;
    }
    async load() {
        const saved = await this.storage.get(FAVORITES_STORAGE_KEY);
        this.stations.clear();
        if (Array.isArray(saved)) {
            for (const item of saved){
                if (item && typeof item.id === 'string' && typeof item.streamUrl === 'string' && typeof item.name === 'string') {
                    this.stations.set(item.id, item);
                }
            }
        }
        return this.list();
    }
    has(stationId) {
        return this.stations.has(stationId);
    }
    list() {
        return Array.from(this.stations.values());
    }
    async toggle(station) {
        let added;
        if (this.stations.has(station.id)) {
            this.stations.delete(station.id);
            added = false;
        } else {
            this.stations.set(station.id, station);
            added = true;
        }
        await this.storage.set(FAVORITES_STORAGE_KEY, this.list());
        return added;
    }
}

const RADIO_BROWSER_API_BASE = 'https://de1.api.radio-browser.info/json';
function isHttpStreamUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch  {
        return false;
    }
}
function mapRadioBrowserStation(raw) {
    const streamUrl = (raw.url_resolved || raw.url || '').trim();
    const name = (raw.name || '').trim();
    if (!name || !streamUrl || !isHttpStreamUrl(streamUrl)) {
        return null;
    }
    const firstTag = (raw.tags || '').split(',').map((t)=>t.trim()).find(Boolean);
    return {
        id: (raw.stationuuid || streamUrl).trim(),
        name,
        streamUrl,
        country: (raw.countrycode || raw.country || '').trim().toUpperCase() || undefined,
        genre: firstTag || undefined,
        bitrate: typeof raw.bitrate === 'number' && raw.bitrate > 0 ? raw.bitrate : undefined,
        codec: (raw.codec || '').trim().toUpperCase() || undefined,
        homepage: raw.homepage && isHttpStreamUrl(raw.homepage) ? raw.homepage : undefined,
        favicon: raw.favicon && isHttpStreamUrl(raw.favicon) ? raw.favicon : undefined,
        providerId: 'radio-browser',
        isLive: true
    };
}
function createRadioBrowserProvider(fetcher, apiBase = RADIO_BROWSER_API_BASE) {
    const fetchStations = async (endpoint)=>{
        const response = await fetcher(`${apiBase}${endpoint}`, {
            headers: {
                Accept: 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Radio Browser HTTP ${response.status}`);
        }
        const rawList = await response.json();
        if (!Array.isArray(rawList)) {
            return [];
        }
        return rawList.map((entry)=>mapRadioBrowserStation(entry)).filter((station)=>station !== null);
    };
    return {
        id: 'radio-browser',
        name: 'Radio Browser (Global & FM IP)',
        description: 'Open community directory of 40,000+ web and FM/DAB+ IP stations',
        async searchStations (query, options = {}) {
            const params = new URLSearchParams({
                hidebroken: 'true',
                order: 'clickcount',
                reverse: 'true',
                limit: String(options.limit ?? 25)
            });
            if (query.trim()) {
                params.set('name', query.trim());
            }
            if (options.country?.trim()) {
                params.set('countrycode', options.country.trim().toUpperCase());
            }
            if (options.genre?.trim()) {
                params.set('tag', options.genre.trim().toLowerCase());
            }
            return fetchStations(`/stations/search?${params.toString()}`);
        },
        async listFeatured () {
            return fetchStations('/stations/topclick/15?hidebroken=true');
        }
    };
}

export const manifest = {
    id: 'mplay3r.radio',
    name: 'Web & FM Radio',
    version: '1.0.0',
    description: 'Stream web radios and FM/DAB+ IP broadcasts via Radio Browser, direct Icecast/SHOUTcast/HLS URLs, ICY live titles, favorites, and ISP box micro-plugins.',
    category: 'source',
    permissions: [
        'network',
        'playlist-write',
        'playback-control',
        'track-metadata',
        'ui-slot',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
let reconnectTimer;
async function resolvePlayableUrl(station, ctx) {
    if (!isHlsStreamUrl(station.streamUrl)) {
        return station.streamUrl;
    }
    try {
        const res = await ctx.fetch(station.streamUrl);
        if (res.ok) {
            const text = await res.text();
            const variants = parseHlsMasterPlaylist(text, station.streamUrl);
            if (variants.length > 0) {
                return variants[0].url;
            }
        }
    } catch  {}
    return station.streamUrl;
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const tracker = new LiveStreamTracker();
        const favorites = new RadioFavoritesStore(ctx.storage);
        await favorites.load();
        ctx.registerProvider('radio', createRadioBrowserProvider((input, init)=>ctx.fetch(input, init)));
        let liveBadgeEl = null;
        const renderLiveBadge = ()=>{
            if (!liveBadgeEl) {
                return;
            }
            const live = tracker.getState();
            if (!live.isLive || !live.station) {
                liveBadgeEl.textContent = '';
                liveBadgeEl.style.display = 'none';
                return;
            }
            liveBadgeEl.style.display = 'flex';
            liveBadgeEl.style.alignItems = 'center';
            liveBadgeEl.style.gap = '0.5rem';
            liveBadgeEl.style.fontSize = '0.75rem';
            const suffix = live.reconnecting ? `Reconnecting (${live.reconnectAttempt})…` : live.nowPlaying || live.station.genre || live.station.codec || 'Live stream';
            liveBadgeEl.innerHTML = '';
            const pill = document.createElement('span');
            pill.textContent = 'LIVE';
            pill.style.padding = '0.1rem 0.45rem';
            pill.style.borderRadius = '999px';
            pill.style.fontWeight = '700';
            pill.style.fontSize = '0.6875rem';
            pill.style.background = 'var(--ds-color-primary-base)';
            pill.style.color = 'var(--mp-accent-contrast)';
            const info = document.createElement('span');
            info.textContent = `${live.station.name} · ${suffix}`;
            info.style.color = 'var(--mp-text-muted)';
            info.style.overflow = 'hidden';
            info.style.textOverflow = 'ellipsis';
            info.style.whiteSpace = 'nowrap';
            liveBadgeEl.append(pill, info);
        };
        const playStation = async (station)=>{
            clearTimeout(reconnectTimer);
            const streamUrl = await resolvePlayableUrl(station, ctx);
            const resolvedStation = {
                ...station,
                streamUrl,
                isLive: true
            };
            tracker.registerLiveStation(resolvedStation);
            await ctx.playlist.clearPlaylist();
            const added = await ctx.playlist.addTracks([
                {
                    src: streamUrl,
                    title: station.name,
                    artist: station.genre ? `LIVE · ${station.genre}` : 'LIVE Radio',
                    format: isHlsStreamUrl(streamUrl) ? 'HLS' : station.codec || 'LIVE'
                }
            ], true);
            if (added[0]) {
                tracker.onTrackChanged(added[0]);
                renderLiveBadge();
            }
            await ctx.notify(`Tuning ${station.name}`, 'success');
        };
        ctx.on('trackChange', ({ track })=>{
            clearTimeout(reconnectTimer);
            tracker.onTrackChanged(track);
            renderLiveBadge();
        });
        ctx.on('stateChange', (snapshot)=>{
            if (snapshot.status === 'playing' && tracker.getState().reconnecting) {
                tracker.markRecovered();
                renderLiveBadge();
            }
        });
        ctx.on('error', ()=>{
            const delay = tracker.scheduleReconnect();
            renderLiveBadge();
            if (delay !== null) {
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(()=>{
                    void ctx.playback.play();
                }, delay);
            }
        });
        ctx.registerSlot({
            id: 'live-badge',
            slot: 'track-info',
            mount (container) {
                liveBadgeEl = container;
                renderLiveBadge();
                return ()=>{
                    liveBadgeEl = null;
                };
            }
        });
        ctx.registerSlot({
            id: 'radio-panel',
            slot: 'panel',
            title: 'Radios',
            mount (container) {
                let activeProviderId = 'all';
                let query = '';
                let country = '';
                let stations = [];
                let loading = false;
                const renderPanel = ()=>{
                    const providers = ctx.getProviders('radio');
                    container.innerHTML = '';
                    const wrap = document.createElement('div');
                    wrap.style.display = 'flex';
                    wrap.style.flexDirection = 'column';
                    wrap.style.gap = '0.5rem';
                    const bar = document.createElement('div');
                    bar.style.display = 'flex';
                    bar.style.flexWrap = 'wrap';
                    bar.style.gap = '0.35rem';
                    const providerSelect = document.createElement('select');
                    providerSelect.setAttribute('aria-label', 'Radio source');
                    providerSelect.style.padding = '0.3rem 0.5rem';
                    providerSelect.style.borderRadius = '6px';
                    providerSelect.style.border = '1px solid var(--mp-border)';
                    providerSelect.style.background = 'var(--mp-bg)';
                    providerSelect.style.color = 'var(--mp-text)';
                    providerSelect.style.fontSize = '0.78rem';
                    const options = [
                        [
                            'all',
                            `All sources (${providers.length})`
                        ],
                        [
                            'favorites',
                            `Favorites (${favorites.list().length})`
                        ],
                        ...providers.map((p)=>[
                                p.id,
                                p.name
                            ])
                    ];
                    for (const [val, label] of options){
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.textContent = label;
                        opt.selected = val === activeProviderId;
                        providerSelect.append(opt);
                    }
                    providerSelect.addEventListener('change', ()=>{
                        activeProviderId = providerSelect.value;
                        void runSearch();
                    });
                    const searchInput = document.createElement('input');
                    searchInput.type = 'search';
                    searchInput.placeholder = 'Search FM / Web radios…';
                    searchInput.value = query;
                    searchInput.style.flex = '1 1 8rem';
                    searchInput.style.padding = '0.3rem 0.55rem';
                    searchInput.style.borderRadius = '6px';
                    searchInput.style.border = '1px solid var(--mp-border)';
                    searchInput.style.background = 'var(--mp-bg)';
                    searchInput.style.color = 'var(--mp-text)';
                    searchInput.style.fontSize = '0.78rem';
                    searchInput.addEventListener('input', ()=>{
                        query = searchInput.value;
                    });
                    const countryInput = document.createElement('input');
                    countryInput.type = 'text';
                    countryInput.placeholder = 'FR';
                    countryInput.maxLength = 2;
                    countryInput.value = country;
                    countryInput.style.width = '3rem';
                    countryInput.style.padding = '0.3rem 0.45rem';
                    countryInput.style.borderRadius = '6px';
                    countryInput.style.border = '1px solid var(--mp-border)';
                    countryInput.style.background = 'var(--mp-bg)';
                    countryInput.style.color = 'var(--mp-text)';
                    countryInput.style.fontSize = '0.78rem';
                    countryInput.addEventListener('input', ()=>{
                        country = countryInput.value;
                    });
                    const searchBtn = document.createElement('button');
                    searchBtn.type = 'button';
                    searchBtn.textContent = loading ? '…' : 'Search';
                    searchBtn.style.padding = '0.3rem 0.65rem';
                    searchBtn.style.borderRadius = '999px';
                    searchBtn.style.border = '1px solid var(--ds-color-primary-base)';
                    searchBtn.style.background = 'var(--ds-color-primary-base)';
                    searchBtn.style.color = 'var(--mp-accent-contrast)';
                    searchBtn.style.fontSize = '0.75rem';
                    searchBtn.style.cursor = 'pointer';
                    searchBtn.addEventListener('click', ()=>void runSearch());
                    bar.append(providerSelect, searchInput, countryInput, searchBtn);
                    const directForm = document.createElement('form');
                    directForm.style.display = 'flex';
                    directForm.style.gap = '0.35rem';
                    const directInput = document.createElement('input');
                    directInput.type = 'url';
                    directInput.placeholder = 'Direct Icecast / SHOUTcast / HLS .m3u8 URL';
                    directInput.style.flex = '1';
                    directInput.style.padding = '0.28rem 0.55rem';
                    directInput.style.borderRadius = '6px';
                    directInput.style.border = '1px solid var(--mp-border)';
                    directInput.style.background = 'var(--mp-bg)';
                    directInput.style.color = 'var(--mp-text)';
                    directInput.style.fontSize = '0.75rem';
                    const tuneBtn = document.createElement('button');
                    tuneBtn.type = 'submit';
                    tuneBtn.textContent = 'Tune URL';
                    tuneBtn.style.padding = '0.28rem 0.6rem';
                    tuneBtn.style.borderRadius = '999px';
                    tuneBtn.style.border = '1px solid var(--mp-border)';
                    tuneBtn.style.background = 'var(--mp-bg)';
                    tuneBtn.style.color = 'var(--mp-text)';
                    tuneBtn.style.fontSize = '0.75rem';
                    tuneBtn.style.cursor = 'pointer';
                    directForm.addEventListener('submit', (event)=>{
                        event.preventDefault();
                        const rawUrl = directInput.value.trim();
                        if (!rawUrl) return;
                        void playStation({
                            id: `direct:${rawUrl}`,
                            name: rawUrl.replace(/^https?:\/\//i, '').slice(0, 48),
                            streamUrl: rawUrl,
                            providerId: 'direct',
                            isLive: true
                        });
                        directInput.value = '';
                    });
                    directForm.append(directInput, tuneBtn);
                    const list = document.createElement('div');
                    list.style.display = 'flex';
                    list.style.flexDirection = 'column';
                    list.style.gap = '0.3rem';
                    list.style.maxHeight = '14rem';
                    list.style.overflowY = 'auto';
                    if (stations.length === 0) {
                        const empty = document.createElement('p');
                        empty.textContent = loading ? 'Loading stations…' : 'Search for a station or pick a source above.';
                        empty.style.margin = '0.4rem 0';
                        empty.style.fontSize = '0.78rem';
                        empty.style.color = 'var(--mp-text-muted)';
                        list.append(empty);
                    } else {
                        for (const station of stations){
                            const row = document.createElement('div');
                            row.style.display = 'flex';
                            row.style.alignItems = 'center';
                            row.style.justifyContent = 'space-between';
                            row.style.gap = '0.5rem';
                            row.style.padding = '0.35rem 0.5rem';
                            row.style.borderRadius = '6px';
                            row.style.border = '1px solid var(--mp-border)';
                            row.style.background = 'var(--mp-bg)';
                            const meta = document.createElement('div');
                            meta.style.minWidth = '0';
                            meta.style.flex = '1';
                            const title = document.createElement('div');
                            title.textContent = station.name;
                            title.style.fontSize = '0.8rem';
                            title.style.fontWeight = '600';
                            title.style.overflow = 'hidden';
                            title.style.textOverflow = 'ellipsis';
                            title.style.whiteSpace = 'nowrap';
                            const sub = document.createElement('div');
                            sub.textContent = [
                                station.country,
                                station.genre,
                                station.bitrate ? `${station.bitrate}k` : '',
                                station.providerId
                            ].filter(Boolean).join(' · ');
                            sub.style.fontSize = '0.7rem';
                            sub.style.color = 'var(--mp-text-muted)';
                            meta.append(title, sub);
                            const btns = document.createElement('div');
                            btns.style.display = 'flex';
                            btns.style.gap = '0.3rem';
                            const favBtn = document.createElement('button');
                            favBtn.type = 'button';
                            favBtn.textContent = favorites.has(station.id) ? '★' : '☆';
                            favBtn.setAttribute('aria-label', `Toggle favorite ${station.name}`);
                            favBtn.style.border = '1px solid var(--mp-border)';
                            favBtn.style.borderRadius = '6px';
                            favBtn.style.background = 'transparent';
                            favBtn.style.color = favorites.has(station.id) ? 'var(--ds-color-primary-base)' : 'var(--mp-text-muted)';
                            favBtn.style.cursor = 'pointer';
                            favBtn.addEventListener('click', async ()=>{
                                await favorites.toggle(station);
                                if (activeProviderId === 'favorites') {
                                    stations = favorites.list();
                                }
                                renderPanel();
                            });
                            const playBtn = document.createElement('button');
                            playBtn.type = 'button';
                            playBtn.textContent = 'Play';
                            playBtn.style.padding = '0.2rem 0.55rem';
                            playBtn.style.borderRadius = '999px';
                            playBtn.style.border = '1px solid var(--ds-color-primary-base)';
                            playBtn.style.background = 'var(--mp-accent-soft)';
                            playBtn.style.color = 'var(--ds-color-primary-base)';
                            playBtn.style.fontSize = '0.72rem';
                            playBtn.style.cursor = 'pointer';
                            playBtn.addEventListener('click', ()=>void playStation(station));
                            btns.append(favBtn, playBtn);
                            row.append(meta, btns);
                            list.append(row);
                        }
                    }
                    wrap.append(bar, directForm, list);
                    container.append(wrap);
                };
                const runSearch = async ()=>{
                    if (activeProviderId === 'favorites') {
                        stations = favorites.list();
                        renderPanel();
                        return;
                    }
                    loading = true;
                    renderPanel();
                    const providers = ctx.getProviders('radio').filter((p)=>activeProviderId === 'all' || p.id === activeProviderId);
                    const collected = [];
                    for (const provider of providers){
                        try {
                            const found = query.trim() || country.trim() || !provider.listFeatured ? await provider.searchStations(query, {
                                country,
                                limit: 15
                            }) : await provider.listFeatured();
                            collected.push(...found);
                        } catch  {}
                    }
                    stations = collected;
                    loading = false;
                    renderPanel();
                };
                renderPanel();
                void runSearch();
                return ()=>{
                    container.innerHTML = '';
                };
            }
        });
    },
    deactivate () {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
    }
};
export default plugin;
