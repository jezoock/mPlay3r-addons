// mPlay3r addon bundle: mplay3r.scraper@1.0.0 (generated from plugins/scraper/src)

const LRC_TIMESTAMP_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_META_TAG_RE = /^\[([a-zA-Z]{2,12}):([^\]]*)\]$/;
function parseLrcTimestamp(minsStr, secsStr, fracStr) {
    const mins = Number.parseInt(minsStr, 10);
    const secs = Number.parseInt(secsStr, 10);
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || mins < 0 || secs < 0 || secs >= 60) {
        return null;
    }
    let fraction = 0;
    if (fracStr) {
        if (fracStr.length === 1) fraction = Number.parseInt(fracStr, 10) / 10;
        else if (fracStr.length === 2) fraction = Number.parseInt(fracStr, 10) / 100;
        else fraction = Number.parseInt(fracStr.slice(0, 3), 10) / 1000;
    }
    return Math.round((mins * 60 + secs + fraction) * 1000) / 1000;
}
function parseLrc(raw) {
    const metadata = {};
    let offsetSeconds = 0;
    const rawEntries = [];
    const plainLines = [];
    for (const rawLine of (raw || '').split(/\r?\n/)){
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const timestamps = [];
        LRC_TIMESTAMP_RE.lastIndex = 0;
        let match = LRC_TIMESTAMP_RE.exec(trimmed);
        while(match !== null){
            const ts = parseLrcTimestamp(match[1], match[2], match[3]);
            if (ts !== null) timestamps.push(ts);
            match = LRC_TIMESTAMP_RE.exec(trimmed);
        }
        if (timestamps.length === 0) {
            const metaMatch = LRC_META_TAG_RE.exec(trimmed);
            if (metaMatch) {
                const key = metaMatch[1].toLowerCase();
                const val = metaMatch[2].trim();
                metadata[key] = val;
                if (key === 'offset') {
                    const ms = Number.parseInt(val, 10);
                    if (Number.isFinite(ms)) {
                        offsetSeconds = ms / 1000;
                    }
                }
            }
            continue;
        }
        const text = trimmed.replace(LRC_TIMESTAMP_RE, '').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/\s{2,}/g, ' ').trim();
        if (text) {
            plainLines.push(text);
        }
        for (const ts of timestamps){
            rawEntries.push({
                timeSeconds: ts,
                text
            });
        }
    }
    const lines = rawEntries.map((entry)=>({
            timeSeconds: Math.max(0, Math.round((entry.timeSeconds - offsetSeconds) * 1000) / 1000),
            text: entry.text
        })).sort((a, b)=>a.timeSeconds - b.timeSeconds);
    return {
        metadata,
        offsetSeconds,
        lines,
        plainText: plainLines.join('\n')
    };
}
function findActiveLrcLineIndex(lines, currentTimeSeconds) {
    if (lines.length === 0 || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
        return -1;
    }
    const target = currentTimeSeconds + 0.05;
    if (target < lines[0].timeSeconds) {
        return -1;
    }
    let lo = 0;
    let hi = lines.length - 1;
    let ans = 0;
    while(lo <= hi){
        const mid = lo + hi >> 1;
        if (lines[mid].timeSeconds <= target) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}
function getActiveLrcWindow(lines, currentTimeSeconds) {
    const index = findActiveLrcLineIndex(lines, currentTimeSeconds);
    if (index < 0) {
        return {
            index: -1,
            prev: null,
            active: null,
            next: lines[0] ?? null
        };
    }
    return {
        index,
        prev: index > 0 ? lines[index - 1] : null,
        active: lines[index] ?? null,
        next: index + 1 < lines.length ? lines[index + 1] : null
    };
}

const AUDIO_EXT_RE = /\.(?:mp3|flac|wav|ogg|oga|opus|m4a|aac|webm)$/i;
const LEADING_TRACK_NUM_RE = /^\s*(?:\d{1,3}\s*[-._)]\s+|\[\d{1,3}\]\s*)/;
const NOISE_BRACKET_RE = /\s*[[(]\s*(?:official(?:\s+music)?\s+video|official\s+audio|lyrics?(?:\s+video)?|audio|hd|hq|4k|remaster(?:ed)?(?:\s+\d{4})?|explicit|clean|flac|320\s*kbps|bonus\s+track|radio\s+edit|album\s+version)\s*[\])]/gi;
const FEAT_SUFFIX_RE = /\s*(?:[[(])?\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]+(?:[\])])?/gi;
function cleanTrackField(raw, options = {}) {
    let cleaned = (raw || '').replace(AUDIO_EXT_RE, '').replace(LEADING_TRACK_NUM_RE, '').replace(/_/g, ' ').replace(NOISE_BRACKET_RE, '');
    if (options.stripFeaturing) {
        cleaned = cleaned.replace(FEAT_SUFFIX_RE, '');
    }
    return cleaned.replace(/\s{2,}/g, ' ').trim();
}
function normalizeCachePart(value) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function normalizeTrackQuery(track) {
    const rawTitle = (track.title || '').trim();
    const rawArtist = (track.artist || '').trim();
    const isGenericArtist = !rawArtist || /^(?:unknown(?:\s+artist)?|various(?:\s+artists)?|live(?:\s+radio)?)$/i.test(rawArtist);
    let artist = isGenericArtist ? '' : rawArtist;
    let title = rawTitle;
    if (/^live\s*[·-]/i.test(artist)) {
        artist = '';
    }
    if (!artist) {
        const preCleaned = title.replace(AUDIO_EXT_RE, '').replace(LEADING_TRACK_NUM_RE, '');
        const splitMatch = /^(.+?)\s+[-–—]\s+(.+)$/.exec(preCleaned);
        if (splitMatch?.[1] && splitMatch?.[2]) {
            artist = splitMatch[1].trim();
            title = splitMatch[2].trim();
        }
    }
    const cleanArtist = cleanTrackField(artist, {
        stripFeaturing: true
    });
    const cleanTitle = cleanTrackField(title, {
        stripFeaturing: true
    });
    const cleanAlbum = track.album ? cleanTrackField(track.album) : undefined;
    if (!cleanTitle) {
        return null;
    }
    const keyArtist = normalizeCachePart(cleanArtist);
    const keyTitle = normalizeCachePart(cleanTitle);
    const keyAlbum = cleanAlbum ? normalizeCachePart(cleanAlbum) : '';
    const cacheKey = `${keyArtist}::${keyTitle}${keyAlbum ? `::${keyAlbum}` : ''}`;
    return {
        artist: cleanArtist,
        title: cleanTitle,
        album: cleanAlbum || undefined,
        duration: typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0 ? Math.round(track.duration) : undefined,
        cacheKey
    };
}

const SCRAPER_CACHE_KEY = 'scraperMetadataCache';
const SCRAPER_SETTINGS_KEY = 'scraperSettings';
const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const COVER_ART_BASE = 'https://coverartarchive.org';
const LRCLIB_BASE = 'https://lrclib.net/api';
const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 200;
const DEFAULT_SCRAPER_SETTINGS = {
    autoScrape: true,
    fetchCoverArt: true,
    fetchLyrics: true,
    enrichTrackTags: true
};
function isSafeHttpsUrl(url) {
    return Boolean(url && /^https?:\/\/\S+/i.test(url.trim()));
}
function upgradeToHttps(url) {
    return url.trim().replace(/^http:\/\//i, 'https://');
}
class PoliteRateLimiter {
    minIntervalMs;
    now;
    sleep;
    nextAllowedAt = new Map();
    constructor(options = {}){
        this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 1100);
        this.now = options.now ?? (()=>Date.now());
        this.sleep = options.sleep ?? ((ms)=>new Promise((resolve)=>setTimeout(resolve, ms)));
    }
    async waitForSlot(bucket) {
        const current = this.now();
        const allowedAt = this.nextAllowedAt.get(bucket) ?? current;
        const waitMs = Math.max(0, allowedAt - current);
        if (waitMs > 0) {
            await this.sleep(waitMs);
        }
        this.nextAllowedAt.set(bucket, this.now() + this.minIntervalMs);
        return waitMs;
    }
    applyBackoff(bucket, retryAfterMs) {
        const delay = Math.max(this.minIntervalMs, Math.min(60_000, retryAfterMs));
        this.nextAllowedAt.set(bucket, this.now() + delay);
    }
}
class ScraperCacheStore {
    storage;
    ttlMs;
    maxEntries;
    now;
    entries = new Map();
    constructor(storage, options = {}){
        this.storage = storage;
        this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
        this.maxEntries = Math.max(10, options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES);
        this.now = options.now ?? (()=>Date.now());
    }
    async load() {
        const saved = await this.storage.get(SCRAPER_CACHE_KEY);
        this.entries.clear();
        if (Array.isArray(saved)) {
            for (const item of saved){
                if (item && typeof item.cacheKey === 'string' && !this.isExpired(item)) {
                    this.entries.set(item.cacheKey, item);
                }
            }
        }
        return this.entries.size;
    }
    isExpired(entry) {
        const ts = Date.parse(entry.fetchedAt);
        if (!Number.isFinite(ts)) return false;
        return this.now() - ts > this.ttlMs;
    }
    get(cacheKey) {
        const found = this.entries.get(cacheKey);
        if (!found) return null;
        if (this.isExpired(found)) {
            this.entries.delete(cacheKey);
            return null;
        }
        return {
            ...found,
            sources: [
                ...found.sources
            ]
        };
    }
    size() {
        return this.entries.size;
    }
    async set(entry) {
        this.entries.delete(entry.cacheKey);
        this.entries.set(entry.cacheKey, entry);
        while(this.entries.size > this.maxEntries){
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey === undefined) break;
            this.entries.delete(oldestKey);
        }
        await this.storage.set(SCRAPER_CACHE_KEY, Array.from(this.entries.values()));
    }
    async clear() {
        this.entries.clear();
        await this.storage.remove(SCRAPER_CACHE_KEY);
    }
}
function escapeLuceneTerm(value) {
    return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
function parseRetryAfterMs(res) {
    const raw = res.headers?.get?.('retry-after');
    if (!raw) return 5000;
    const secs = Number.parseInt(raw, 10);
    return Number.isFinite(secs) && secs > 0 ? secs * 1000 : 5000;
}
async function fetchMusicBrainzAndCoverArt(query, fetcher, rateLimiter, options = {}) {
    const parts = [
        `recording:"${escapeLuceneTerm(query.title)}"`
    ];
    if (query.artist) parts.push(`artist:"${escapeLuceneTerm(query.artist)}"`);
    if (query.album) parts.push(`release:"${escapeLuceneTerm(query.album)}"`);
    const params = new URLSearchParams({
        query: parts.join(' AND '),
        fmt: 'json',
        limit: '3'
    });
    await rateLimiter.waitForSlot('musicbrainz');
    const res = await fetcher(`${MUSICBRAINZ_BASE}/recording/?${params.toString()}`, {
        headers: {
            Accept: 'application/json'
        }
    });
    if (res.status === 429 || res.status === 503) {
        rateLimiter.applyBackoff('musicbrainz', parseRetryAfterMs(res));
        return {
            partial: {},
            sources: [],
            rateLimited: true
        };
    }
    if (!res.ok) {
        return {
            partial: {},
            sources: [],
            rateLimited: false
        };
    }
    const data = await res.json();
    const top = Array.isArray(data.recordings) ? data.recordings[0] : undefined;
    if (!top) {
        return {
            partial: {},
            sources: [],
            rateLimited: false
        };
    }
    const credit = top['artist-credit']?.[0];
    const release = top.releases?.[0];
    const tags = (top.tags ?? []).slice(0, 4).map((t)=>t.name).filter((n)=>Boolean(n));
    const bioParts = [
        credit?.artist?.disambiguation,
        tags.length > 0 ? `Tags: ${tags.join(', ')}` : ''
    ].filter(Boolean);
    const partial = {
        mbid: top.id,
        title: top.title || query.title,
        artist: credit?.name || credit?.artist?.name || query.artist,
        album: release?.title || query.album,
        releaseDate: release?.date,
        releaseMbid: release?.id,
        bio: bioParts.length > 0 ? bioParts.join(' · ') : undefined
    };
    const sources = [
        'MusicBrainz'
    ];
    if (options.fetchCoverArt !== false && release?.id) {
        try {
            await rateLimiter.waitForSlot('coverartarchive');
            const caRes = await fetcher(`${COVER_ART_BASE}/release/${encodeURIComponent(release.id)}`, {
                headers: {
                    Accept: 'application/json'
                }
            });
            if (caRes.ok) {
                const caJson = await caRes.json();
                const front = caJson.images?.find((img)=>img.front) ?? caJson.images?.[0];
                if (front && isSafeHttpsUrl(front.image)) {
                    partial.coverArtUrl = upgradeToHttps(front.image);
                    const thumb = front.thumbnails?.['500'] || front.thumbnails?.large || front.thumbnails?.['250'] || front.image;
                    partial.coverArtThumbUrl = isSafeHttpsUrl(thumb) ? upgradeToHttps(thumb) : partial.coverArtUrl;
                    sources.push('Cover Art Archive');
                }
            }
        } catch  {}
    }
    return {
        partial,
        sources,
        rateLimited: false
    };
}
async function fetchLrclibLyrics(query, fetcher, rateLimiter) {
    await rateLimiter.waitForSlot('lrclib');
    if (query.artist) {
        const params = new URLSearchParams({
            track_name: query.title,
            artist_name: query.artist
        });
        if (query.album) params.set('album_name', query.album);
        if (query.duration) params.set('duration', String(query.duration));
        const exactRes = await fetcher(`${LRCLIB_BASE}/get?${params.toString()}`, {
            headers: {
                Accept: 'application/json'
            }
        });
        if (exactRes.status === 429 || exactRes.status === 503) {
            rateLimiter.applyBackoff('lrclib', parseRetryAfterMs(exactRes));
            return {
                found: false,
                rateLimited: true
            };
        }
        if (exactRes.ok) {
            const rec = await exactRes.json();
            if (rec.syncedLyrics || rec.plainLyrics) {
                return {
                    syncedLyrics: rec.syncedLyrics || undefined,
                    plainLyrics: rec.plainLyrics || undefined,
                    album: rec.albumName || undefined,
                    found: true,
                    rateLimited: false
                };
            }
        }
    }
    const searchParams = new URLSearchParams({
        q: [
            query.artist,
            query.title
        ].filter(Boolean).join(' ')
    });
    await rateLimiter.waitForSlot('lrclib');
    const searchRes = await fetcher(`${LRCLIB_BASE}/search?${searchParams.toString()}`, {
        headers: {
            Accept: 'application/json'
        }
    });
    if (searchRes.status === 429 || searchRes.status === 503) {
        rateLimiter.applyBackoff('lrclib', parseRetryAfterMs(searchRes));
        return {
            found: false,
            rateLimited: true
        };
    }
    if (!searchRes.ok) {
        return {
            found: false,
            rateLimited: false
        };
    }
    const items = await searchRes.json();
    const best = Array.isArray(items) ? items.find((r)=>Boolean(r.syncedLyrics)) ?? items.find((r)=>Boolean(r.plainLyrics)) : undefined;
    if (!best) {
        return {
            found: false,
            rateLimited: false
        };
    }
    return {
        syncedLyrics: best.syncedLyrics || undefined,
        plainLyrics: best.plainLyrics || undefined,
        album: best.albumName || undefined,
        found: true,
        rateLimited: false
    };
}
class MetadataScraperService {
    fetcher;
    storage;
    cache;
    rateLimiter;
    isOnline;
    now;
    tagWriter;
    settings = {
        ...DEFAULT_SCRAPER_SETTINGS
    };
    constructor(options){
        this.fetcher = options.fetcher;
        this.storage = options.storage;
        this.now = options.now ?? (()=>Date.now());
        this.cache = options.cache ?? new ScraperCacheStore(options.storage, {
            now: this.now
        });
        this.rateLimiter = options.rateLimiter ?? new PoliteRateLimiter({
            now: this.now
        });
        this.isOnline = options.isOnline ?? (()=>typeof navigator === 'undefined' || navigator.onLine !== false);
        this.tagWriter = options.tagWriter;
    }
    async load() {
        await this.cache.load();
        const saved = await this.storage.get(SCRAPER_SETTINGS_KEY);
        if (saved && typeof saved === 'object') {
            this.settings = {
                autoScrape: typeof saved.autoScrape === 'boolean' ? saved.autoScrape : DEFAULT_SCRAPER_SETTINGS.autoScrape,
                fetchCoverArt: typeof saved.fetchCoverArt === 'boolean' ? saved.fetchCoverArt : DEFAULT_SCRAPER_SETTINGS.fetchCoverArt,
                fetchLyrics: typeof saved.fetchLyrics === 'boolean' ? saved.fetchLyrics : DEFAULT_SCRAPER_SETTINGS.fetchLyrics,
                enrichTrackTags: typeof saved.enrichTrackTags === 'boolean' ? saved.enrichTrackTags : DEFAULT_SCRAPER_SETTINGS.enrichTrackTags
            };
        }
    }
    getSettings() {
        return {
            ...this.settings
        };
    }
    async updateSettings(patch) {
        this.settings = {
            ...this.settings,
            ...patch
        };
        await this.storage.set(SCRAPER_SETTINGS_KEY, this.settings);
        return this.getSettings();
    }
    getCacheSize() {
        return this.cache.size();
    }
    async clearCache() {
        await this.cache.clear();
    }
    async scrapeTrack(track, options = {}) {
        const query = normalizeTrackQuery(track);
        if (!query) {
            return {
                metadata: null,
                fromCache: false,
                offline: false,
                rateLimited: false
            };
        }
        if (!options.forceRefresh) {
            const cached = this.cache.get(query.cacheKey);
            if (cached) {
                return {
                    metadata: cached,
                    fromCache: true,
                    offline: false,
                    rateLimited: false
                };
            }
        }
        if (!this.isOnline()) {
            const staleCached = this.cache.get(query.cacheKey);
            return {
                metadata: staleCached,
                fromCache: staleCached !== null,
                offline: true,
                rateLimited: false
            };
        }
        const sources = [];
        let rateLimited = false;
        let mbPartial = {};
        let lyricsResult = {
            found: false,
            rateLimited: false
        };
        let networkErrorCount = 0;
        if (this.settings.fetchCoverArt) {
            try {
                const mb = await fetchMusicBrainzAndCoverArt(query, this.fetcher, this.rateLimiter, {
                    fetchCoverArt: true
                });
                mbPartial = mb.partial;
                sources.push(...mb.sources);
                if (mb.rateLimited) rateLimited = true;
            } catch  {
                networkErrorCount += 1;
            }
        }
        if (this.settings.fetchLyrics) {
            try {
                lyricsResult = await fetchLrclibLyrics(query, this.fetcher, this.rateLimiter);
                if (lyricsResult.found) sources.push('LRCLIB');
                if (lyricsResult.rateLimited) rateLimited = true;
            } catch  {
                networkErrorCount += 1;
            }
        }
        const totalAttempted = (this.settings.fetchCoverArt ? 1 : 0) + (this.settings.fetchLyrics ? 1 : 0);
        if (sources.length === 0) {
            return {
                metadata: null,
                fromCache: false,
                offline: totalAttempted > 0 && networkErrorCount >= totalAttempted,
                rateLimited
            };
        }
        const metadata = {
            cacheKey: query.cacheKey,
            artist: mbPartial.artist || query.artist,
            title: mbPartial.title || query.title,
            album: mbPartial.album || lyricsResult.album || query.album,
            releaseDate: mbPartial.releaseDate,
            mbid: mbPartial.mbid,
            releaseMbid: mbPartial.releaseMbid,
            coverArtUrl: mbPartial.coverArtUrl,
            coverArtThumbUrl: mbPartial.coverArtThumbUrl,
            syncedLyrics: lyricsResult.syncedLyrics,
            plainLyrics: lyricsResult.plainLyrics,
            bio: mbPartial.bio,
            fetchedAt: new Date(this.now()).toISOString(),
            sources
        };
        await this.cache.set(metadata);
        if (this.settings.enrichTrackTags && track.id && options.updateTrackMetadata) {
            const patch = {};
            if (!track.artist && metadata.artist) patch.artist = metadata.artist;
            if (!track.album && metadata.album) patch.album = metadata.album;
            if (Object.keys(patch).length > 0) {
                await options.updateTrackMetadata(track.id, patch).catch(()=>false);
            }
        }
        if (this.tagWriter && track.filePath) {
            await this.tagWriter.writeTags(track.filePath, metadata).catch(()=>false);
        }
        return {
            metadata,
            fromCache: false,
            offline: false,
            rateLimited
        };
    }
}

export const manifest = {
    id: 'mplay3r.scraper',
    name: 'Metadata Scraper (Cover Art & Synced Lyrics)',
    version: '1.0.0',
    description: '100% opt-in metadata enrichment on track change: HD cover art (MusicBrainz + Cover Art Archive), synced .lrc lyrics (LRCLIB), persistent cache, polite rate limiting, and offline resilience.',
    category: 'scraper',
    permissions: [
        'network',
        'track-metadata',
        'ui-slot',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
let activeScraperSeq = 0;
function scEl(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}
function scBtn(label, onClick, accent = false) {
    const btn = scEl('button', accent ? 'padding:0.18rem 0.5rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.7rem;font-weight:600;cursor:pointer' : 'padding:0.18rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.7rem;cursor:pointer', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const service = new MetadataScraperService({
            fetcher: (input, init)=>ctx.fetch(input, init),
            storage: ctx.storage
        });
        await service.load();
        let currentTrack = ctx.getState().currentTrack;
        let currentMeta = null;
        let currentLrc = null;
        let currentTime = ctx.getState().currentTime;
        let activeLineIdx = -1;
        let loading = false;
        let statusNote = '';
        let trackInfoEl = null;
        let rerenderPanel = null;
        const renderTrackInfo = ()=>{
            if (!trackInfoEl) return;
            if (!currentMeta) {
                trackInfoEl.textContent = '';
                trackInfoEl.style.display = 'none';
                return;
            }
            const lrcWin = currentLrc ? getActiveLrcWindow(currentLrc.lines, currentTime) : null;
            const lineText = lrcWin?.active?.text || lrcWin?.next?.text || currentMeta.album || '';
            if (!currentMeta.coverArtThumbUrl && !lineText) {
                trackInfoEl.style.display = 'none';
                return;
            }
            trackInfoEl.style.cssText = 'display:flex;align-items:center;gap:0.45rem;font-size:0.74rem;min-width:0';
            trackInfoEl.innerHTML = '';
            if (currentMeta.coverArtThumbUrl) {
                const img = scEl('img', 'width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0');
                img.src = currentMeta.coverArtThumbUrl;
                img.alt = `${currentMeta.album || currentMeta.title} cover art`;
                trackInfoEl.append(img);
            }
            if (lineText) {
                const lyricSpan = scEl('span', 'color:var(--mp-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic', lrcWin?.active ? `♪ ${lineText}` : lineText);
                trackInfoEl.append(lyricSpan);
            }
        };
        const runScrapeForTrack = async (track, forceRefresh = false)=>{
            activeScraperSeq += 1;
            const seq = activeScraperSeq;
            currentTrack = track;
            currentMeta = null;
            currentLrc = null;
            activeLineIdx = -1;
            if (!track) {
                statusNote = '';
                renderTrackInfo();
                rerenderPanel?.();
                return;
            }
            if (!forceRefresh && !service.getSettings().autoScrape) {
                statusNote = 'Auto-scraping paused (click Refresh to fetch).';
                renderTrackInfo();
                rerenderPanel?.();
                return;
            }
            loading = true;
            statusNote = 'Enriching cover art & synced lyrics…';
            renderTrackInfo();
            rerenderPanel?.();
            const outcome = await service.scrapeTrack(track, {
                forceRefresh,
                updateTrackMetadata: (id, patch)=>ctx.updateTrackMetadata(id, patch)
            });
            if (seq !== activeScraperSeq) {
                return;
            }
            loading = false;
            currentMeta = outcome.metadata;
            currentLrc = outcome.metadata?.syncedLyrics ? parseLrc(outcome.metadata.syncedLyrics) : null;
            activeLineIdx = currentLrc ? getActiveLrcWindow(currentLrc.lines, currentTime).index : -1;
            if (outcome.offline && !outcome.metadata) {
                statusNote = 'Offline — no cached metadata for this track.';
            } else if (outcome.rateLimited && !outcome.metadata) {
                statusNote = 'Rate-limited by upstream API — will retry later.';
            } else if (!outcome.metadata) {
                statusNote = 'No online cover art or lyrics found for this track.';
            } else {
                const srcList = outcome.metadata.sources.join(' · ');
                statusNote = outcome.fromCache ? `Cached (${srcList})` : srcList;
            }
            renderTrackInfo();
            rerenderPanel?.();
        };
        ctx.on('trackChange', ({ track })=>{
            currentTime = 0;
            void runScrapeForTrack(track, false);
        });
        ctx.on('timeUpdate', ({ currentTime: t })=>{
            currentTime = t;
            if (!currentLrc || currentLrc.lines.length === 0) return;
            const nextIdx = getActiveLrcWindow(currentLrc.lines, t).index;
            if (nextIdx !== activeLineIdx) {
                activeLineIdx = nextIdx;
                renderTrackInfo();
                rerenderPanel?.();
            }
        });
        ctx.registerSlot({
            id: 'scraper-now-playing',
            slot: 'track-info',
            mount (container) {
                trackInfoEl = container;
                renderTrackInfo();
                return ()=>{
                    trackInfoEl = null;
                };
            }
        });
        ctx.registerSlot({
            id: 'scraper-panel',
            slot: 'panel',
            title: 'Lyrics & Info',
            mount (container) {
                const renderPanel = ()=>{
                    const settings = service.getSettings();
                    container.innerHTML = '';
                    const wrap = scEl('div', 'display:flex;flex-direction:column;gap:0.5rem');
                    const controls = scEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem;align-items:center;justify-content:space-between');
                    const btnGroup = scEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem');
                    btnGroup.append(scBtn(settings.autoScrape ? 'Auto: ON' : 'Auto: OFF', ()=>void service.updateSettings({
                            autoScrape: !settings.autoScrape
                        }).then(()=>renderPanel()), settings.autoScrape), scBtn(loading ? '…' : 'Refresh', ()=>void runScrapeForTrack(currentTrack, true)), scBtn(`Clear Cache (${service.getCacheSize()})`, ()=>{
                        void service.clearCache().then(()=>{
                            statusNote = 'Metadata cache cleared.';
                            renderPanel();
                        });
                    }));
                    controls.append(btnGroup, scEl('span', 'font-size:0.69rem;color:var(--mp-text-muted)', statusNote));
                    wrap.append(controls);
                    if (!currentTrack) {
                        wrap.append(scEl('p', 'margin:0.3rem 0;font-size:0.75rem;color:var(--mp-text-muted)', 'Play a track to fetch HD cover art and synced lyrics.'));
                        container.append(wrap);
                        return;
                    }
                    if (currentMeta) {
                        const card = scEl('div', 'display:flex;gap:0.65rem;align-items:center;padding:0.45rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)');
                        if (currentMeta.coverArtUrl || currentMeta.coverArtThumbUrl) {
                            const art = scEl('img', 'width:68px;height:68px;border-radius:6px;object-fit:cover;flex-shrink:0');
                            art.src = currentMeta.coverArtThumbUrl || currentMeta.coverArtUrl || '';
                            art.alt = `${currentMeta.title} cover`;
                            card.append(art);
                        }
                        const metaCol = scEl('div', 'min-width:0;flex:1;display:flex;flex-direction:column;gap:0.15rem');
                        metaCol.append(scEl('div', 'font-size:0.84rem;font-weight:700', currentMeta.title), scEl('div', 'font-size:0.74rem;color:var(--mp-text-muted)', [
                            currentMeta.artist,
                            currentMeta.album,
                            currentMeta.releaseDate
                        ].filter(Boolean).join(' · ')));
                        if (currentMeta.bio) {
                            metaCol.append(scEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', currentMeta.bio));
                        }
                        card.append(metaCol);
                        wrap.append(card);
                        const lyricsBox = scEl('div', 'max-height:13rem;overflow-y:auto;padding:0.45rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);display:flex;flex-direction:column;gap:0.2rem');
                        if (currentLrc && currentLrc.lines.length > 0) {
                            for(let i = 0; i < currentLrc.lines.length; i += 1){
                                const line = currentLrc.lines[i];
                                const isActive = i === activeLineIdx;
                                const row = scEl('div', isActive ? 'font-size:0.8rem;font-weight:700;color:var(--ds-color-primary-base)' : 'font-size:0.74rem;color:var(--mp-text-muted)', line.text || '···');
                                lyricsBox.append(row);
                            }
                        } else if (currentMeta.plainLyrics) {
                            lyricsBox.append(scEl('pre', 'margin:0;white-space:pre-wrap;font-family:inherit;font-size:0.74rem;color:var(--mp-text)', currentMeta.plainLyrics));
                        } else {
                            lyricsBox.append(scEl('span', 'font-size:0.73rem;color:var(--mp-text-muted)', 'No lyrics available for this track.'));
                        }
                        wrap.append(lyricsBox);
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
        if (currentTrack && service.getSettings().autoScrape) {
            void runScrapeForTrack(currentTrack, false);
        }
    },
    deactivate () {
        activeScraperSeq += 1;
    }
};
export default plugin;
