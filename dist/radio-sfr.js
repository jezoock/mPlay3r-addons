// mPlay3r addon bundle: mplay3r.radio-sfr@1.0.0 (generated from plugins/radio-sfr/src)

const SFR_DEFAULT_M3U_URL = 'http://neufbox/tv/playlist.m3u';
const SFR_PROVIDER_ID = 'sfr-box';
const SFR_FM_FALLBACK = [
    {
        id: 'sfr:rmc',
        name: 'RMC Info Talk Sport',
        streamUrl: 'https://audio.bfmtv.com/rmcradio_128.mp3',
        country: 'FR',
        genre: 'Info & Sport · FM',
        codec: 'MP3',
        bitrate: 128,
        providerId: SFR_PROVIDER_ID,
        isLive: true
    },
    {
        id: 'sfr:bfm-business',
        name: 'BFM Business',
        streamUrl: 'https://audio.bfmtv.com/bfmbusiness_128.mp3',
        country: 'FR',
        genre: 'Économie · FM',
        codec: 'MP3',
        bitrate: 128,
        providerId: SFR_PROVIDER_ID,
        isLive: true
    },
    {
        id: 'sfr:france-inter',
        name: 'France Inter',
        streamUrl: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3',
        country: 'FR',
        genre: 'Généraliste · FM',
        codec: 'MP3',
        bitrate: 128,
        providerId: SFR_PROVIDER_ID,
        isLive: true
    },
    {
        id: 'sfr:fip',
        name: 'FIP',
        streamUrl: 'https://icecast.radiofrance.fr/fip-hifi.aac',
        country: 'FR',
        genre: 'Éclectique · FM',
        codec: 'AAC',
        bitrate: 192,
        providerId: SFR_PROVIDER_ID,
        isLive: true
    },
    {
        id: 'sfr:radio-classique',
        name: 'Radio Classique',
        streamUrl: 'https://radioclassique.ice.infomaniak.ch/radioclassique-high.mp3',
        country: 'FR',
        genre: 'Classique · FM',
        codec: 'MP3',
        bitrate: 128,
        providerId: SFR_PROVIDER_ID,
        isLive: true
    },
    {
        id: 'sfr:jazz-radio',
        name: 'Jazz Radio',
        streamUrl: 'https://jazzradio.ice.infomaniak.ch/jazzradio-high.mp3',
        country: 'FR',
        genre: 'Jazz · FM',
        codec: 'MP3',
        bitrate: 128,
        providerId: SFR_PROVIDER_ID,
        isLive: true
    }
];
const SFR_RADIO_NAME_RE = /\b(?:radio|fip|france\s*(?:inter|info|culture|musique|bleu)|ici\s+[a-z]|mouv'?|rtl2?|europe\s*[12]|rmc|bfm\s*(?:radio|business)|rfm|nrj|skyrock|nostalgie|fun\s*radio|nova|tsf\s*jazz|jazz\s*radio|sud\s*radio|classique)\b/i;
function isSfrRadioEntry(title, url, group) {
    if (group && /radio/i.test(group)) return true;
    if (/[?&]type=radio\b|\/radio\b/i.test(url)) return true;
    if (/^\s*8\d{2}\s*[-–—]/.test(title)) return true;
    return SFR_RADIO_NAME_RE.test(title);
}
function normalizeSfrStationName(rawTitle) {
    return rawTitle.replace(/^\s*\d{1,5}\s*[-–—]\s*/, '').replace(/\s*\((?:sfr|neufbox|bas d[eé]bit|hd|sd)\)\s*$/i, '').trim();
}
function parseSfrRadioPlaylist(m3uContent) {
    const lines = m3uContent.replace(/\r\n?/g, '\n').split('\n');
    const stations = [];
    const seen = new Set();
    let pendingTitle = '';
    let pendingGroup = '';
    for (const rawLine of lines){
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF:')) {
            const groupMatch = /group-title="([^"]*)"/i.exec(line);
            pendingGroup = groupMatch?.[1]?.trim() || '';
            const commaIdx = line.indexOf(',');
            pendingTitle = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
            continue;
        }
        if (line.startsWith('#')) continue;
        if (!/^(?:https?|rtsp):\/\/\S+/i.test(line)) {
            pendingTitle = '';
            pendingGroup = '';
            continue;
        }
        const rawName = pendingTitle || line.split('/').pop() || 'SFR Radio';
        if (isSfrRadioEntry(rawName, line, pendingGroup)) {
            const cleanName = normalizeSfrStationName(rawName);
            const dedupeKey = cleanName.toLowerCase();
            if (cleanName && !seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                stations.push({
                    id: `sfr:${dedupeKey.replace(/[^a-z0-9]+/g, '-')}`,
                    name: cleanName,
                    streamUrl: line,
                    country: 'FR',
                    genre: pendingGroup || 'SFR Radio',
                    codec: line.startsWith('rtsp://') ? 'RTSP' : 'STREAM',
                    providerId: SFR_PROVIDER_ID,
                    isLive: true
                });
            }
        }
        pendingTitle = '';
        pendingGroup = '';
    }
    return stations;
}
function createSfrRadioProvider(fetcher, playlistUrl = SFR_DEFAULT_M3U_URL) {
    let cached = null;
    const loadStations = async ()=>{
        if (cached) return cached;
        try {
            const res = await fetcher(playlistUrl);
            if (res.ok) {
                const parsed = parseSfrRadioPlaylist(await res.text());
                if (parsed.length > 0) {
                    cached = parsed;
                    return parsed;
                }
            }
        } catch  {}
        cached = [
            ...SFR_FM_FALLBACK
        ];
        return cached;
    };
    return {
        id: SFR_PROVIDER_ID,
        name: 'SFR Box (Neufbox)',
        description: 'SFR Box / Neufbox multiposte radio bouquet with French FM/DAB+ IP fallback.',
        async listFeatured () {
            return loadStations();
        },
        async searchStations (query, options) {
            const all = await loadStations();
            const q = (query || '').trim().toLowerCase();
            const genre = (options?.genre || '').trim().toLowerCase();
            const limit = options?.limit ?? 30;
            return all.filter((st)=>{
                if (q && !st.name.toLowerCase().includes(q) && !(st.genre || '').toLowerCase().includes(q)) return false;
                if (genre && !(st.genre || '').toLowerCase().includes(genre)) return false;
                return true;
            }).slice(0, limit);
        }
    };
}

const SFR_CUSTOM_URL_KEY = 'playlistUrl';
export const manifest = {
    id: 'mplay3r.radio-sfr',
    name: 'SFR Box Radios (Neufbox / Red)',
    version: '1.0.0',
    description: 'ISP box micro-plugin adding SFR Box / Neufbox multiposte radio channels (and French FM/DAB+ IP fallback streams) to the mPlay3r Radio plugin.',
    category: 'source',
    permissions: [
        'network',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
export const plugin = {
    manifest,
    async activate (ctx) {
        const savedUrl = await ctx.storage.get(SFR_CUSTOM_URL_KEY);
        const playlistUrl = typeof savedUrl === 'string' && savedUrl.trim() ? savedUrl.trim() : SFR_DEFAULT_M3U_URL;
        ctx.registerProvider('radio', createSfrRadioProvider((input, init)=>ctx.fetch(input, init), playlistUrl));
    }
};
export default plugin;
