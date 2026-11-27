// mPlay3r addon bundle: mplay3r.podcasts@1.0.0 (generated from plugins/podcasts/src)

const XML_NAMED_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    hellip: '…'
};
function isSafePodcastUrl(url) {
    if (!url) {
        return false;
    }
    const trimmed = url.trim();
    return /^https?:\/\/\S+/i.test(trimmed);
}
function decodePodcastFeedBytes(bytes, contentType) {
    if (bytes.byteLength === 0) {
        return '';
    }
    let charset;
    if (bytes.byteLength >= 2) {
        if (bytes[0] === 0xff && bytes[1] === 0xfe) {
            charset = 'utf-16le';
        } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
            charset = 'utf-16be';
        }
    }
    if (!charset && contentType) {
        const headerMatch = /charset\s*=\s*["']?([A-Za-z0-9._-]+)["']?/i.exec(contentType);
        if (headerMatch?.[1]) {
            charset = headerMatch[1].trim();
        }
    }
    if (!charset) {
        const headLen = Math.min(bytes.byteLength, 256);
        let asciiHead = '';
        for(let i = 0; i < headLen; i += 1){
            asciiHead += String.fromCharCode(bytes[i]);
        }
        const xmlMatch = /<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._-]+)["']/i.exec(asciiHead);
        if (xmlMatch?.[1]) {
            charset = xmlMatch[1].trim();
        }
    }
    const normalized = (charset || 'utf-8').toLowerCase();
    try {
        return new TextDecoder(normalized, {
            fatal: false
        }).decode(bytes);
    } catch  {
        return new TextDecoder('utf-8', {
            fatal: false
        }).decode(bytes);
    }
}
function decodeXmlEntities(input) {
    if (!input) {
        return '';
    }
    const unwrapped = input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    return unwrapped.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, token)=>{
        if (token.startsWith('#x') || token.startsWith('#X')) {
            const code = Number.parseInt(token.slice(2), 16);
            return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
        }
        if (token.startsWith('#')) {
            const code = Number.parseInt(token.slice(1), 10);
            return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
        }
        return XML_NAMED_ENTITIES[token.toLowerCase()] ?? full;
    });
}
function stripPodcastHtml(input) {
    if (!input) {
        return '';
    }
    const decoded = decodeXmlEntities(input);
    return decoded.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function parsePodcastTimestamp(raw) {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) && raw >= 0 ? raw : undefined;
    }
    if (typeof raw !== 'string') {
        return undefined;
    }
    const value = raw.trim();
    if (!value) {
        return undefined;
    }
    if (/^\d+(?:\.\d+)?$/.test(value)) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }
    const colonParts = value.split(':');
    if (colonParts.length === 2 || colonParts.length === 3) {
        const nums = colonParts.map((part)=>Number.parseFloat(part.trim()));
        if (nums.every((n)=>Number.isFinite(n) && n >= 0)) {
            if (nums.length === 3) {
                return nums[0] * 3600 + nums[1] * 60 + nums[2];
            }
            return nums[0] * 60 + nums[1];
        }
    }
    const humanMatch = /^(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?)?$/i.exec(value);
    if (humanMatch && (humanMatch[1] || humanMatch[2] || humanMatch[3])) {
        const hours = humanMatch[1] ? Number.parseInt(humanMatch[1], 10) : 0;
        const mins = humanMatch[2] ? Number.parseInt(humanMatch[2], 10) : 0;
        const secs = humanMatch[3] ? Number.parseFloat(humanMatch[3]) : 0;
        return hours * 3600 + mins * 60 + secs;
    }
    return undefined;
}
function parsePodcastDuration(raw) {
    const secs = parsePodcastTimestamp(raw);
    if (secs === undefined || secs <= 0) {
        return undefined;
    }
    return Math.round(secs);
}
function formatPodcastTime(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const mins = Math.floor(total % 3600 / 60);
    const secs = total % 60;
    const pad2 = (n)=>String(n).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad2(mins)}:${pad2(secs)}` : `${mins}:${pad2(secs)}`;
}
function parseXmlAttributes(attrSource) {
    const attrs = {};
    const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of attrSource.matchAll(attrRe)){
        const key = match[1].toLowerCase();
        const val = match[2] ?? match[3] ?? '';
        attrs[key] = decodeXmlEntities(val.trim());
    }
    return attrs;
}
function escapeTagName(tagName) {
    return tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractTagText(xml, tagNames) {
    for (const name of tagNames){
        const escaped = escapeTagName(name);
        const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
        const match = re.exec(xml);
        if (match?.[1] !== undefined) {
            const value = decodeXmlEntities(match[1]).trim();
            if (value) {
                return value;
            }
        }
    }
    return undefined;
}
function extractTagBlocks(xml, tagName) {
    const escaped = escapeTagName(tagName);
    const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
    const results = [];
    for (const match of xml.matchAll(re)){
        results.push(match[1]);
    }
    return results;
}
function extractOpenTags(xml, tagName) {
    const escaped = escapeTagName(tagName);
    const re = new RegExp(`<${escaped}\\b([^>]*)>`, 'gi');
    const results = [];
    for (const match of xml.matchAll(re)){
        results.push(parseXmlAttributes(match[1] || ''));
    }
    return results;
}
function parsePodloveChapters(itemXml) {
    const chapters = [];
    for (const attrs of extractOpenTags(itemXml, 'psc:chapter')){
        const startSeconds = parsePodcastTimestamp(attrs.start);
        const title = attrs.title?.trim();
        if (startSeconds !== undefined && title) {
            chapters.push({
                startSeconds,
                title,
                href: isSafePodcastUrl(attrs.href) ? attrs.href.trim() : undefined
            });
        }
    }
    return chapters.sort((a, b)=>a.startSeconds - b.startSeconds);
}
function extractInlineChapters(notesText) {
    if (!notesText) {
        return [];
    }
    const chapters = [];
    const seenTimes = new Set();
    const lineRe = /^\s*(?:\(|\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\)|\])?\s*[-–—:|]?\s+(.+?)\s*$/;
    for (const line of notesText.split(/\r?\n/)){
        const match = lineRe.exec(line);
        if (!match) {
            continue;
        }
        const startSeconds = parsePodcastTimestamp(match[1]);
        const title = match[2].trim();
        if (startSeconds === undefined || !title || title.length > 140 || seenTimes.has(startSeconds)) {
            continue;
        }
        seenTimes.add(startSeconds);
        chapters.push({
            startSeconds,
            title
        });
    }
    return chapters.length >= 2 ? chapters.sort((a, b)=>a.startSeconds - b.startSeconds) : [];
}
function findActiveChapter(chapters, currentTimeSeconds) {
    if (!chapters || chapters.length === 0 || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
        return null;
    }
    let active = null;
    for (const chapter of chapters){
        if (chapter.startSeconds <= currentTimeSeconds + 0.25) {
            active = chapter;
        } else {
            break;
        }
    }
    return active;
}
function normalizeIsoDate(raw) {
    if (!raw) {
        return undefined;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw.trim();
}
function parsePositiveInt(raw) {
    if (!raw) {
        return undefined;
    }
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}
function extractArtworkFromXml(xml) {
    for (const attrs of extractOpenTags(xml, 'itunes:image')){
        if (isSafePodcastUrl(attrs.href)) {
            return attrs.href.trim();
        }
    }
    for (const attrs of extractOpenTags(xml, 'media:thumbnail')){
        if (isSafePodcastUrl(attrs.url)) {
            return attrs.url.trim();
        }
    }
    const imageBlock = extractTagBlocks(xml, 'image')[0];
    if (imageBlock) {
        const url = extractTagText(imageBlock, [
            'url'
        ]);
        if (isSafePodcastUrl(url)) {
            return url.trim();
        }
    }
    const atomLogo = extractTagText(xml, [
        'logo',
        'icon'
    ]);
    if (isSafePodcastUrl(atomLogo)) {
        return atomLogo.trim();
    }
    return undefined;
}
function extractEnclosureFromItem(itemXml) {
    const enclosures = extractOpenTags(itemXml, 'enclosure');
    for (const enc of enclosures){
        if (!isSafePodcastUrl(enc.url)) {
            continue;
        }
        const type = enc.type?.toLowerCase() || '';
        if (!type || type.startsWith('audio/') || type === 'application/octet-stream' || type.includes('mpegurl')) {
            return {
                audioUrl: enc.url.trim(),
                mimeType: enc.type || undefined,
                byteLength: parsePositiveInt(enc.length)
            };
        }
    }
    for (const media of extractOpenTags(itemXml, 'media:content')){
        if (!isSafePodcastUrl(media.url)) {
            continue;
        }
        const type = media.type?.toLowerCase() || '';
        const medium = media.medium?.toLowerCase() || '';
        if (medium === 'audio' || type.startsWith('audio/') || /\.(?:mp3|m4a|aac|ogg|opus|flac|wav)(?:$|\?)/i.test(media.url)) {
            return {
                audioUrl: media.url.trim(),
                mimeType: media.type || undefined,
                byteLength: parsePositiveInt(media.filesize)
            };
        }
    }
    for (const link of extractOpenTags(itemXml, 'link')){
        if ((link.rel || '').toLowerCase() === 'enclosure' && isSafePodcastUrl(link.href)) {
            const type = link.type?.toLowerCase() || '';
            if (!type || type.startsWith('audio/') || type === 'application/octet-stream') {
                return {
                    audioUrl: link.href.trim(),
                    mimeType: link.type || undefined,
                    byteLength: parsePositiveInt(link.length)
                };
            }
        }
    }
    return null;
}
function parseRssFeed(xml, feedUrl) {
    const channelXml = extractTagBlocks(xml, 'channel')[0] ?? xml;
    const firstItemIdx = channelXml.search(/<item(?:\s|>)/i);
    const channelHeader = firstItemIdx >= 0 ? channelXml.slice(0, firstItemIdx) : channelXml;
    const title = stripPodcastHtml(extractTagText(channelHeader, [
        'title'
    ]) || '') || 'Untitled Podcast';
    const author = stripPodcastHtml(extractTagText(channelHeader, [
        'itunes:author',
        'dc:creator',
        'managingEditor',
        'author'
    ]) || '') || undefined;
    const description = stripPodcastHtml(extractTagText(channelHeader, [
        'itunes:summary',
        'description',
        'itunes:subtitle'
    ]) || '') || undefined;
    const artworkUrl = extractArtworkFromXml(channelHeader);
    const link = extractTagText(channelHeader, [
        'link'
    ]);
    const language = extractTagText(channelHeader, [
        'language'
    ]);
    const categoriesSet = new Set();
    for (const attrs of extractOpenTags(channelHeader, 'itunes:category')){
        if (attrs.text) {
            categoriesSet.add(attrs.text);
        }
    }
    for (const catText of extractTagBlocks(channelHeader, 'category')){
        const clean = stripPodcastHtml(catText);
        if (clean) {
            categoriesSet.add(clean);
        }
    }
    const itemBlocks = extractTagBlocks(channelXml, 'item');
    const episodes = [];
    for(let idx = 0; idx < itemBlocks.length; idx += 1){
        const itemXml = itemBlocks[idx];
        const enclosure = extractEnclosureFromItem(itemXml);
        if (!enclosure) {
            continue;
        }
        const epTitle = stripPodcastHtml(extractTagText(itemXml, [
            'itunes:title',
            'title'
        ]) || '') || `Episode ${idx + 1}`;
        const rawDescription = extractTagText(itemXml, [
            'content:encoded',
            'description',
            'itunes:summary',
            'itunes:subtitle'
        ]) || '';
        const epDescription = stripPodcastHtml(rawDescription) || undefined;
        const podloveChapters = parsePodloveChapters(itemXml);
        const chapters = podloveChapters.length > 0 ? podloveChapters : extractInlineChapters(epDescription || '');
        const guid = extractTagText(itemXml, [
            'guid'
        ]) || enclosure.audioUrl;
        episodes.push({
            id: guid,
            feedUrl,
            showTitle: title,
            title: epTitle,
            audioUrl: enclosure.audioUrl,
            mimeType: enclosure.mimeType,
            byteLength: enclosure.byteLength,
            duration: parsePodcastDuration(extractTagText(itemXml, [
                'itunes:duration',
                'duration'
            ])),
            publishedAt: normalizeIsoDate(extractTagText(itemXml, [
                'pubDate',
                'dc:date',
                'published'
            ])),
            description: epDescription,
            artworkUrl: extractArtworkFromXml(itemXml) || artworkUrl,
            episodeNumber: parsePositiveInt(extractTagText(itemXml, [
                'itunes:episode'
            ])),
            seasonNumber: parsePositiveInt(extractTagText(itemXml, [
                'itunes:season'
            ])),
            chapters
        });
    }
    return {
        feedUrl,
        title,
        author,
        description,
        artworkUrl,
        link: isSafePodcastUrl(link) ? link.trim() : undefined,
        language,
        categories: Array.from(categoriesSet),
        episodes
    };
}
function parseAtomFeed(xml, feedUrl) {
    const feedXml = extractTagBlocks(xml, 'feed')[0] ?? xml;
    const firstEntryIdx = feedXml.search(/<entry(?:\s|>)/i);
    const feedHeader = firstEntryIdx >= 0 ? feedXml.slice(0, firstEntryIdx) : feedXml;
    const title = stripPodcastHtml(extractTagText(feedHeader, [
        'title'
    ]) || '') || 'Untitled Podcast';
    const authorBlock = extractTagBlocks(feedHeader, 'author')[0];
    const author = stripPodcastHtml((authorBlock ? extractTagText(authorBlock, [
        'name'
    ]) : undefined) || extractTagText(feedHeader, [
        'itunes:author',
        'dc:creator'
    ]) || '') || undefined;
    const description = stripPodcastHtml(extractTagText(feedHeader, [
        'subtitle',
        'itunes:summary'
    ]) || '') || undefined;
    const artworkUrl = extractArtworkFromXml(feedHeader);
    let link;
    for (const attrs of extractOpenTags(feedHeader, 'link')){
        if ((!attrs.rel || attrs.rel === 'alternate') && isSafePodcastUrl(attrs.href)) {
            link = attrs.href.trim();
            break;
        }
    }
    const categoriesSet = new Set();
    for (const attrs of extractOpenTags(feedHeader, 'category')){
        const label = attrs.label || attrs.term;
        if (label) {
            categoriesSet.add(label);
        }
    }
    const entries = extractTagBlocks(feedXml, 'entry');
    const episodes = [];
    for(let idx = 0; idx < entries.length; idx += 1){
        const entryXml = entries[idx];
        const enclosure = extractEnclosureFromItem(entryXml);
        if (!enclosure) {
            continue;
        }
        const epTitle = stripPodcastHtml(extractTagText(entryXml, [
            'title'
        ]) || '') || `Episode ${idx + 1}`;
        const rawDesc = extractTagText(entryXml, [
            'content',
            'summary',
            'itunes:summary'
        ]) || '';
        const epDescription = stripPodcastHtml(rawDesc) || undefined;
        const podloveChapters = parsePodloveChapters(entryXml);
        const chapters = podloveChapters.length > 0 ? podloveChapters : extractInlineChapters(epDescription || '');
        const id = extractTagText(entryXml, [
            'id'
        ]) || enclosure.audioUrl;
        episodes.push({
            id,
            feedUrl,
            showTitle: title,
            title: epTitle,
            audioUrl: enclosure.audioUrl,
            mimeType: enclosure.mimeType,
            byteLength: enclosure.byteLength,
            duration: parsePodcastDuration(extractTagText(entryXml, [
                'itunes:duration',
                'duration'
            ])),
            publishedAt: normalizeIsoDate(extractTagText(entryXml, [
                'published',
                'updated'
            ])),
            description: epDescription,
            artworkUrl: extractArtworkFromXml(entryXml) || artworkUrl,
            episodeNumber: parsePositiveInt(extractTagText(entryXml, [
                'itunes:episode'
            ])),
            seasonNumber: parsePositiveInt(extractTagText(entryXml, [
                'itunes:season'
            ])),
            chapters
        });
    }
    return {
        feedUrl,
        title,
        author,
        description,
        artworkUrl,
        link,
        categories: Array.from(categoriesSet),
        episodes
    };
}
function parsePodcastFeed(xml, feedUrl = '') {
    const cleaned = (xml || '').replace(/^\uFEFF/, '').trim();
    if (!cleaned) {
        return {
            feedUrl,
            title: 'Untitled Podcast',
            categories: [],
            episodes: []
        };
    }
    const isAtom = /<feed(?:\s|>)/i.test(cleaned) && !/<channel(?:\s|>)/i.test(cleaned);
    return isAtom ? parseAtomFeed(cleaned, feedUrl) : parseRssFeed(cleaned, feedUrl);
}

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
const SPOTIFY_OEMBED_URL = 'https://open.spotify.com/oembed';
function mapItunesPodcastResult(raw) {
    const feedUrl = raw.feedUrl?.trim();
    const title = (raw.collectionName || raw.trackName || '').trim();
    if (!title || !isSafePodcastUrl(feedUrl)) {
        return null;
    }
    const id = String(raw.collectionId ?? raw.trackId ?? feedUrl);
    const artwork = raw.artworkUrl600 || raw.artworkUrl100;
    return {
        id: `itunes:${id}`,
        title,
        author: raw.artistName?.trim() || undefined,
        feedUrl,
        artworkUrl: isSafePodcastUrl(artwork) ? artwork.trim() : undefined,
        genre: raw.primaryGenreName?.trim() || undefined,
        episodeCount: typeof raw.trackCount === 'number' && raw.trackCount > 0 ? raw.trackCount : undefined,
        providerId: 'mplay3r-podcasts'
    };
}
function mapPodcastIndexResult(raw) {
    const feedUrl = raw.url?.trim();
    const title = (raw.title || '').trim();
    if (!title || !isSafePodcastUrl(feedUrl)) {
        return null;
    }
    const artwork = raw.artwork || raw.image;
    let genre;
    if (Array.isArray(raw.categories)) {
        genre = raw.categories.find(Boolean);
    } else if (raw.categories && typeof raw.categories === 'object') {
        genre = Object.values(raw.categories).find(Boolean);
    }
    return {
        id: `podcastindex:${String(raw.id ?? feedUrl)}`,
        title,
        author: (raw.author || raw.ownerName)?.trim() || undefined,
        feedUrl,
        artworkUrl: isSafePodcastUrl(artwork) ? artwork.trim() : undefined,
        genre: genre?.trim() || undefined,
        episodeCount: typeof raw.episodeCount === 'number' && raw.episodeCount > 0 ? raw.episodeCount : undefined,
        providerId: 'mplay3r-podcasts'
    };
}
async function searchItunesPodcasts(query, fetcher, options = {}) {
    const trimmed = query.trim();
    if (!trimmed) {
        return [];
    }
    const params = new URLSearchParams({
        media: 'podcast',
        entity: 'podcast',
        term: trimmed,
        limit: String(Math.min(Math.max(options.limit ?? 15, 1), 50))
    });
    if (options.country && /^[a-z]{2}$/i.test(options.country.trim())) {
        params.set('country', options.country.trim().toUpperCase());
    }
    const res = await fetcher(`${ITUNES_SEARCH_URL}?${params.toString()}`);
    if (!res.ok) {
        throw new Error(`iTunes podcast search failed (HTTP ${res.status})`);
    }
    const payload = await res.json();
    if (!Array.isArray(payload?.results)) {
        return [];
    }
    return payload.results.map(mapItunesPodcastResult).filter((item)=>item !== null);
}
async function searchPodcastIndex(query, fetcher, options) {
    const trimmed = query.trim();
    if (!trimmed || !isSafePodcastUrl(options.endpoint)) {
        return [];
    }
    const separator = options.endpoint.includes('?') ? '&' : '?';
    const params = new URLSearchParams({
        q: trimmed,
        max: String(Math.min(Math.max(options.limit ?? 15, 1), 50))
    });
    const res = await fetcher(`${options.endpoint}${separator}${params.toString()}`, {
        headers: options.headers
    });
    if (!res.ok) {
        throw new Error(`Podcast Index search failed (HTTP ${res.status})`);
    }
    const payload = await res.json();
    if (!Array.isArray(payload?.feeds)) {
        return [];
    }
    return payload.feeds.map(mapPodcastIndexResult).filter((item)=>item !== null);
}
function detectStreamingPlatform(rawUrl) {
    const trimmed = rawUrl.trim();
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch  {
        return {
            platform: 'generic-web'
        };
    }
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;
    if (host.includes('podcasts.apple.com') || host.includes('itunes.apple.com')) {
        const idMatch = /\/id(\d+)/i.exec(pathname);
        if (idMatch?.[1]) {
            return {
                platform: 'apple',
                appleId: idMatch[1]
            };
        }
    }
    if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
        const spotMatch = /\/(show|episode)\/([A-Za-z0-9]+)/i.exec(pathname);
        if (spotMatch?.[1] && spotMatch?.[2]) {
            return {
                platform: 'spotify',
                spotifyType: spotMatch[1].toLowerCase(),
                spotifyId: spotMatch[2]
            };
        }
    }
    if (host.includes('deezer.com') && /\/show\/\d+/i.test(pathname)) {
        return {
            platform: 'deezer'
        };
    }
    if (host === 'pca.st' || host.includes('pocketcasts.com')) {
        return {
            platform: 'pocketcasts'
        };
    }
    if (host.includes('overcast.fm')) {
        return {
            platform: 'overcast'
        };
    }
    if (/\.(?:xml|rss|atom)(?:$|\?)/i.test(pathname) || /(?:^|\/)(?:feed|rss|podcast\.xml)(?:\/|$)/i.test(pathname) || /(?:format|type)=(?:rss|atom|xml)/i.test(parsed.search)) {
        return {
            platform: 'rss'
        };
    }
    const slug = pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ').replace(/\.[a-z0-9]+$/i, '').trim();
    return {
        platform: 'generic-web',
        slugHint: slug && slug.length >= 3 ? slug : undefined
    };
}
function extractAlternateFeedUrls(html, pageUrl) {
    if (!html) {
        return [];
    }
    const rssUrls = [];
    const atomUrls = [];
    const linkRe = /<link\b([^>]*)>/gi;
    for (const match of html.matchAll(linkRe)){
        const attrStr = match[1] || '';
        const relMatch = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrStr);
        const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrStr);
        const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrStr);
        const rel = (relMatch?.[1] ?? relMatch?.[2] ?? '').toLowerCase();
        const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? '').toLowerCase();
        const rawHref = decodeXmlEntities((hrefMatch?.[1] ?? hrefMatch?.[2] ?? '').trim());
        if (!rel.split(/\s+/).includes('alternate') || !rawHref) {
            continue;
        }
        const isRss = type.includes('rss+xml') || type === 'text/xml' || type === 'application/xml';
        const isAtom = type.includes('atom+xml');
        if (!isRss && !isAtom) {
            continue;
        }
        try {
            const resolved = new URL(rawHref, pageUrl).toString();
            if (!isSafePodcastUrl(resolved)) {
                continue;
            }
            if (isRss) {
                if (!rssUrls.includes(resolved)) rssUrls.push(resolved);
            } else if (!atomUrls.includes(resolved)) {
                atomUrls.push(resolved);
            }
        } catch  {}
    }
    return [
        ...rssUrls,
        ...atomUrls
    ];
}
function extractHtmlTitleHint(html) {
    const ogMatch = /<meta[^>]*\bproperty\s*=\s*["']og:title["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i.exec(html) || /<meta[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bproperty\s*=\s*["']og:title["']/i.exec(html);
    const raw = ogMatch?.[1] || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    if (!raw) {
        return undefined;
    }
    return stripPodcastHtml(raw).replace(/\s*[|–—-]\s*(?:Spotify|Apple Podcasts|Deezer|Pocket Casts|Overcast|Podcast).*$/i, '').trim();
}
function normalizeLookupName(value) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function pickBestPodcastMatch(results, hint) {
    if (results.length === 0) {
        return null;
    }
    const target = normalizeLookupName(hint);
    if (!target) {
        return results[0];
    }
    let best = results[0];
    let bestScore = -1;
    for (const item of results){
        const candidate = normalizeLookupName(item.title);
        let score = 0;
        if (candidate === target) {
            score = 100;
        } else if (candidate.includes(target) || target.includes(candidate)) {
            score = 60;
        } else {
            const targetWords = new Set(target.split(' '));
            const overlap = candidate.split(' ').filter((w)=>w.length > 2 && targetWords.has(w)).length;
            score = overlap * 10;
        }
        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    }
    return best;
}
function looksLikeXmlFeed(body, contentType) {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('rss') || ct.includes('atom') || ct.includes('xml')) {
        if (/<(?:rss|feed|rdf:rdf)\b/i.test(body.slice(0, 2048))) {
            return true;
        }
    }
    const head = body.replace(/^\uFEFF/, '').trimStart().slice(0, 1024);
    return /^<\?xml\b/i.test(head) && /<(?:rss|feed|channel)\b/i.test(head) || /^<(?:rss|feed)\b/i.test(head);
}
async function resolvePlatformUrlToFeed(rawUrl, fetcher) {
    const trimmed = rawUrl.trim();
    if (!isSafePodcastUrl(trimmed)) {
        return null;
    }
    const detected = detectStreamingPlatform(trimmed);
    if (detected.platform === 'apple' && detected.appleId) {
        const res = await fetcher(`${ITUNES_LOOKUP_URL}?id=${encodeURIComponent(detected.appleId)}&entity=podcast`);
        if (res.ok) {
            const payload = await res.json();
            const mapped = (payload.results ?? []).map(mapItunesPodcastResult).find((item)=>item !== null);
            if (mapped) {
                return {
                    kind: 'platform-resolved',
                    platform: 'apple',
                    originalUrl: trimmed,
                    feedUrl: mapped.feedUrl,
                    title: mapped.title
                };
            }
        }
    }
    if (detected.platform === 'spotify') {
        const oembedUrl = `${SPOTIFY_OEMBED_URL}?url=${encodeURIComponent(trimmed)}`;
        try {
            const oembedRes = await fetcher(oembedUrl);
            if (oembedRes.ok) {
                const meta = await oembedRes.json();
                const titleHint = meta.title?.trim();
                if (titleHint) {
                    const matches = await searchItunesPodcasts(titleHint, fetcher, {
                        limit: 8
                    });
                    const picked = pickBestPodcastMatch(matches, titleHint);
                    if (picked) {
                        return {
                            kind: 'platform-resolved',
                            platform: 'spotify',
                            originalUrl: trimmed,
                            feedUrl: picked.feedUrl,
                            title: picked.title,
                            episodeHint: detected.spotifyType === 'episode' ? titleHint : undefined
                        };
                    }
                }
            }
        } catch  {}
    }
    if (detected.platform === 'rss') {
        return {
            kind: 'feed',
            platform: 'rss',
            originalUrl: trimmed,
            feedUrl: trimmed
        };
    }
    try {
        const res = await fetcher(trimmed);
        if (res.ok) {
            const contentType = res.headers?.get?.('content-type') || '';
            const body = await readResponseDecodedText(res, contentType);
            if (looksLikeXmlFeed(body, contentType)) {
                return {
                    kind: 'feed',
                    platform: 'rss',
                    originalUrl: trimmed,
                    feedUrl: trimmed
                };
            }
            const discovered = extractAlternateFeedUrls(body, trimmed);
            if (discovered.length > 0) {
                return {
                    kind: 'html-autodiscovery',
                    platform: detected.platform,
                    originalUrl: trimmed,
                    feedUrl: discovered[0],
                    title: extractHtmlTitleHint(body)
                };
            }
            const titleHint = extractHtmlTitleHint(body) || detected.slugHint;
            if (titleHint) {
                const matches = await searchItunesPodcasts(titleHint, fetcher, {
                    limit: 8
                });
                const picked = pickBestPodcastMatch(matches, titleHint);
                if (picked) {
                    return {
                        kind: 'platform-resolved',
                        platform: detected.platform,
                        originalUrl: trimmed,
                        feedUrl: picked.feedUrl,
                        title: picked.title
                    };
                }
            }
        }
    } catch  {
        if (detected.slugHint) {
            const matches = await searchItunesPodcasts(detected.slugHint, fetcher, {
                limit: 5
            });
            const picked = pickBestPodcastMatch(matches, detected.slugHint);
            if (picked) {
                return {
                    kind: 'platform-resolved',
                    platform: detected.platform,
                    originalUrl: trimmed,
                    feedUrl: picked.feedUrl,
                    title: picked.title
                };
            }
        }
    }
    return null;
}
async function readResponseDecodedText(res, contentType) {
    if (typeof res.arrayBuffer === 'function') {
        const buffer = await res.arrayBuffer();
        return decodePodcastFeedBytes(new Uint8Array(buffer), contentType);
    }
    return res.text();
}
async function fetchAndParsePodcastFeed(feedUrl, fetcher) {
    if (!isSafePodcastUrl(feedUrl)) {
        throw new Error('Invalid podcast feed URL (only http/https URLs are supported).');
    }
    const res = await fetcher(feedUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch podcast feed (HTTP ${res.status})`);
    }
    const contentType = res.headers?.get?.('content-type') || undefined;
    const xml = await readResponseDecodedText(res, contentType);
    return parsePodcastFeed(xml, feedUrl);
}
function episodeToMediaItem(episode, providerId = 'mplay3r-podcasts') {
    return {
        id: episode.id,
        title: episode.title,
        streamUrl: episode.audioUrl,
        artist: episode.showTitle,
        album: episode.showTitle,
        duration: episode.duration,
        publishedAt: episode.publishedAt,
        description: episode.description,
        artworkUrl: episode.artworkUrl,
        providerId
    };
}
function createPodcastMediaSourceProvider(fetcher, options = {}) {
    return {
        id: 'mplay3r-podcasts',
        name: 'Podcasts (RSS / iTunes)',
        async search (query, searchOpts) {
            const limit = searchOpts?.limit ?? 15;
            const results = [];
            const seenFeeds = new Set();
            const pushUnique = (items)=>{
                for (const item of items){
                    if (!seenFeeds.has(item.feedUrl)) {
                        seenFeeds.add(item.feedUrl);
                        results.push(item);
                    }
                }
            };
            if (options.podcastIndexEndpoint) {
                try {
                    const pi = await searchPodcastIndex(query, fetcher, {
                        endpoint: options.podcastIndexEndpoint,
                        headers: options.podcastIndexHeaders,
                        limit
                    });
                    pushUnique(pi);
                } catch  {}
            }
            if (results.length < limit) {
                const itunes = await searchItunesPodcasts(query, fetcher, {
                    limit
                });
                pushUnique(itunes);
            }
            return results.slice(0, limit).map((show)=>({
                    id: show.id,
                    title: show.title,
                    streamUrl: show.feedUrl,
                    artist: show.author,
                    album: show.genre,
                    artworkUrl: show.artworkUrl,
                    providerId: 'mplay3r-podcasts'
                }));
        },
        async resolveUrl (url) {
            const resolved = await resolvePlatformUrlToFeed(url, fetcher);
            if (!resolved) {
                return [];
            }
            const feed = await fetchAndParsePodcastFeed(resolved.feedUrl, fetcher);
            return feed.episodes.map((ep)=>episodeToMediaItem(ep, 'mplay3r-podcasts'));
        }
    };
}

const PODCAST_PLAYBACK_RATES = [
    0.75,
    1,
    1.25,
    1.5,
    1.75,
    2
];
const PODCAST_SKIP_BACK_SECONDS = -15;
const PODCAST_SKIP_FORWARD_SECONDS = 30;
const PODCAST_RESUME_MIN_SECONDS = 5;
const PODCAST_COMPLETE_THRESHOLD_RATIO = 0.95;
const PODCAST_COMPLETE_REMAINING_SECONDS = 15;
const PODCAST_SUBSCRIPTIONS_KEY = 'subscriptions';
const PODCAST_PROGRESS_KEY = 'progress';
const PODCAST_RATE_KEY = 'playbackRate';
const PODCAST_OFFLINE_KEY = 'offline';
const PODCAST_OFFLINE_CACHE_NAME = 'mplay3r-podcasts-offline-v1';
function makeEpisodeKey(feedUrl, episodeId, audioUrl) {
    const scope = (feedUrl || 'direct').trim();
    const id = (episodeId || audioUrl || '').trim();
    return `${scope}::${id}`;
}
function clampPlaybackRate(rate) {
    if (!Number.isFinite(rate)) {
        return 1;
    }
    const clamped = Math.min(2, Math.max(0.75, rate));
    return Math.round(clamped * 100) / 100;
}
function nextPlaybackRate(current) {
    const clamped = clampPlaybackRate(current);
    const next = PODCAST_PLAYBACK_RATES.find((r)=>r > clamped + 0.01);
    return next ?? PODCAST_PLAYBACK_RATES[0];
}
function computeSkipTarget(currentTime, duration, deltaSeconds) {
    const safeCurrent = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
    const safeDelta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    const raw = Math.max(0, safeCurrent + safeDelta);
    if (Number.isFinite(duration) && duration > 0) {
        return Math.min(duration, raw);
    }
    return raw;
}
function shouldMarkEpisodeCompleted(position, duration) {
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) {
        return false;
    }
    if (duration <= 30) {
        return position / duration >= PODCAST_COMPLETE_THRESHOLD_RATIO;
    }
    return position / duration >= PODCAST_COMPLETE_THRESHOLD_RATIO || duration - position <= PODCAST_COMPLETE_REMAINING_SECONDS;
}
function computeResumePosition(progress) {
    if (!progress || progress.completed || !Number.isFinite(progress.position)) {
        return 0;
    }
    if (progress.position < PODCAST_RESUME_MIN_SECONDS) {
        return 0;
    }
    if (progress.duration > 0 && progress.position >= progress.duration - 2) {
        return 0;
    }
    return Math.floor(progress.position);
}
class PodcastStateStore {
    storage;
    subscriptions = new Map();
    progress = new Map();
    offline = new Map();
    playbackRate = 1;
    lastSavedPosition = new Map();
    constructor(storage){
        this.storage = storage;
    }
    async load() {
        const [subs, prog, rate, offlineRecords] = await Promise.all([
            this.storage.get(PODCAST_SUBSCRIPTIONS_KEY),
            this.storage.get(PODCAST_PROGRESS_KEY),
            this.storage.get(PODCAST_RATE_KEY),
            this.storage.get(PODCAST_OFFLINE_KEY)
        ]);
        this.subscriptions.clear();
        if (Array.isArray(subs)) {
            for (const item of subs){
                if (item && typeof item.feedUrl === 'string' && typeof item.title === 'string') {
                    this.subscriptions.set(item.feedUrl, item);
                }
            }
        }
        this.progress.clear();
        this.lastSavedPosition.clear();
        if (prog && typeof prog === 'object') {
            for (const [key, entry] of Object.entries(prog)){
                if (entry && typeof entry.position === 'number' && Number.isFinite(entry.position)) {
                    this.progress.set(key, entry);
                    this.lastSavedPosition.set(key, entry.position);
                }
            }
        }
        this.playbackRate = typeof rate === 'number' ? clampPlaybackRate(rate) : 1;
        this.offline.clear();
        if (Array.isArray(offlineRecords)) {
            for (const rec of offlineRecords){
                if (rec && typeof rec.episodeKey === 'string' && typeof rec.audioUrl === 'string') {
                    this.offline.set(rec.episodeKey, rec);
                }
            }
        }
    }
    listSubscriptions() {
        return Array.from(this.subscriptions.values());
    }
    isSubscribed(feedUrl) {
        return this.subscriptions.has(feedUrl);
    }
    async subscribe(sub) {
        const existing = this.subscriptions.get(sub.feedUrl);
        const record = {
            ...existing,
            ...sub,
            subscribedAt: existing?.subscribedAt ?? sub.subscribedAt ?? new Date().toISOString()
        };
        this.subscriptions.set(record.feedUrl, record);
        await this.storage.set(PODCAST_SUBSCRIPTIONS_KEY, this.listSubscriptions());
        return record;
    }
    async unsubscribe(feedUrl) {
        const existed = this.subscriptions.delete(feedUrl);
        if (existed) {
            await this.storage.set(PODCAST_SUBSCRIPTIONS_KEY, this.listSubscriptions());
        }
        return existed;
    }
    getProgress(episodeKey) {
        return this.progress.get(episodeKey) ?? null;
    }
    getResumePosition(episodeKey) {
        return computeResumePosition(this.getProgress(episodeKey));
    }
    listProgress() {
        return Array.from(this.progress.values());
    }
    async saveProgress(episodeKey, position, duration, options = {}) {
        if (!episodeKey || !Number.isFinite(position) || position < 0) {
            return null;
        }
        const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : this.progress.get(episodeKey)?.duration ?? 0;
        const clampedPosition = safeDuration > 0 ? Math.min(safeDuration, position) : position;
        const completed = shouldMarkEpisodeCompleted(clampedPosition, safeDuration);
        const previous = this.progress.get(episodeKey);
        const lastSaved = this.lastSavedPosition.get(episodeKey) ?? -Infinity;
        if (!options.force && previous?.completed === completed && Math.abs(clampedPosition - lastSaved) < 5) {
            return previous ?? null;
        }
        const next = {
            episodeKey,
            position: completed ? 0 : Math.floor(clampedPosition),
            duration: Math.round(safeDuration),
            completed,
            updatedAt: new Date().toISOString()
        };
        this.progress.set(episodeKey, next);
        this.lastSavedPosition.set(episodeKey, clampedPosition);
        await this.persistProgress();
        return next;
    }
    async markCompleted(episodeKey, completed, duration = 0) {
        const existing = this.progress.get(episodeKey);
        const next = {
            episodeKey,
            position: 0,
            duration: duration || existing?.duration || 0,
            completed,
            updatedAt: new Date().toISOString()
        };
        this.progress.set(episodeKey, next);
        this.lastSavedPosition.set(episodeKey, 0);
        await this.persistProgress();
        return next;
    }
    async persistProgress() {
        const obj = {};
        for (const [k, v] of this.progress.entries()){
            obj[k] = v;
        }
        await this.storage.set(PODCAST_PROGRESS_KEY, obj);
    }
    getPlaybackRate() {
        return this.playbackRate;
    }
    async setPlaybackRate(rate) {
        this.playbackRate = clampPlaybackRate(rate);
        await this.storage.set(PODCAST_RATE_KEY, this.playbackRate);
        return this.playbackRate;
    }
    async cyclePlaybackRate() {
        return this.setPlaybackRate(nextPlaybackRate(this.playbackRate));
    }
    listOffline() {
        return Array.from(this.offline.values());
    }
    isOffline(episodeKey) {
        return this.offline.has(episodeKey);
    }
    getOfflineRecord(episodeKey) {
        return this.offline.get(episodeKey) ?? null;
    }
    async recordOffline(record) {
        this.offline.set(record.episodeKey, record);
        await this.storage.set(PODCAST_OFFLINE_KEY, this.listOffline());
    }
    async removeOfflineRecord(episodeKey) {
        const existed = this.offline.delete(episodeKey);
        if (existed) {
            await this.storage.set(PODCAST_OFFLINE_KEY, this.listOffline());
        }
        return existed;
    }
}
class PodcastPlaybackController {
    store;
    adapter;
    knownEpisodesByUrl = new Map();
    state;
    constructor(store, adapter){
        this.store = store;
        this.adapter = adapter;
        this.state = {
            activeEpisode: null,
            activeTrackId: null,
            playbackRate: store.getPlaybackRate(),
            activeChapter: null
        };
    }
    registerEpisode(episode, playableUrl) {
        this.knownEpisodesByUrl.set(episode.audioUrl, episode);
        if (playableUrl && playableUrl !== episode.audioUrl) {
            this.knownEpisodesByUrl.set(playableUrl, episode);
        }
    }
    getState() {
        return {
            ...this.state
        };
    }
    async onTrackChanged(track) {
        if (!track) {
            this.state = {
                activeEpisode: null,
                activeTrackId: null,
                playbackRate: this.store.getPlaybackRate(),
                activeChapter: null
            };
            return {
                episode: null,
                resumeAt: 0,
                playbackRate: 1
            };
        }
        const episode = this.knownEpisodesByUrl.get(track.src) ?? null;
        if (!episode) {
            this.state = {
                activeEpisode: null,
                activeTrackId: track.id,
                playbackRate: this.store.getPlaybackRate(),
                activeChapter: null
            };
            this.adapter.applyPlaybackRate?.(1);
            return {
                episode: null,
                resumeAt: 0,
                playbackRate: 1
            };
        }
        const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
        const resumeAt = this.store.getResumePosition(key);
        const rate = this.store.getPlaybackRate();
        this.state = {
            activeEpisode: episode,
            activeTrackId: track.id,
            playbackRate: rate,
            activeChapter: findActiveChapter(episode.chapters, resumeAt)
        };
        this.adapter.applyPlaybackRate?.(rate);
        if (resumeAt > 0) {
            await this.adapter.seek(resumeAt);
        }
        return {
            episode,
            resumeAt,
            playbackRate: rate
        };
    }
    async onTimeUpdate(currentTime, duration) {
        const ep = this.state.activeEpisode;
        if (!ep) {
            return null;
        }
        const key = makeEpisodeKey(ep.feedUrl, ep.id, ep.audioUrl);
        const effectiveDuration = duration > 0 ? duration : ep.duration ?? 0;
        await this.store.saveProgress(key, currentTime, effectiveDuration);
        const chapter = findActiveChapter(ep.chapters, currentTime);
        this.state = {
            ...this.state,
            activeChapter: chapter
        };
        return chapter;
    }
    async setRate(rate) {
        const updated = await this.store.setPlaybackRate(rate);
        this.state = {
            ...this.state,
            playbackRate: updated
        };
        if (this.state.activeEpisode) {
            this.adapter.applyPlaybackRate?.(updated);
        }
        return updated;
    }
    async cycleRate() {
        return this.setRate(nextPlaybackRate(this.store.getPlaybackRate()));
    }
    async skipBy(deltaSeconds) {
        const current = this.adapter.getCurrentTime();
        const duration = this.adapter.getDuration() || this.state.activeEpisode?.duration || 0;
        const target = computeSkipTarget(current, duration, deltaSeconds);
        await this.adapter.seek(target);
        if (this.state.activeEpisode) {
            const key = makeEpisodeKey(this.state.activeEpisode.feedUrl, this.state.activeEpisode.id, this.state.activeEpisode.audioUrl);
            await this.store.saveProgress(key, target, duration, {
                force: true
            });
            this.state = {
                ...this.state,
                activeChapter: findActiveChapter(this.state.activeEpisode.chapters, target)
            };
        }
        return target;
    }
    async skipBackward(seconds = Math.abs(PODCAST_SKIP_BACK_SECONDS)) {
        return this.skipBy(-Math.abs(seconds));
    }
    async skipForward(seconds = PODCAST_SKIP_FORWARD_SECONDS) {
        return this.skipBy(Math.abs(seconds));
    }
}
class OfflineEpisodeManager {
    store;
    openCache;
    memoryBlobs = new Map();
    objectUrls = new Map();
    constructor(store, openCache){
        this.store = store;
        this.openCache = openCache ?? (async ()=>{
            if (typeof globalThis.caches !== 'undefined' && typeof globalThis.caches.open === 'function') {
                try {
                    return await globalThis.caches.open(PODCAST_OFFLINE_CACHE_NAME);
                } catch  {
                    return null;
                }
            }
            return null;
        });
    }
    async downloadEpisode(episode, fetcher) {
        if (!isSafePodcastUrl(episode.audioUrl)) {
            throw new Error('Cannot download episode: invalid audio URL.');
        }
        const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
        const res = await fetcher(episode.audioUrl);
        if (!res.ok) {
            throw new Error(`Episode download failed (HTTP ${res.status})`);
        }
        const contentType = res.headers?.get?.('content-type') || episode.mimeType || 'audio/mpeg';
        const bytes = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : await (await res.blob()).arrayBuffer();
        const blob = new Blob([
            bytes
        ], {
            type: contentType
        });
        const cache = await this.openCache();
        if (cache) {
            await cache.put(episode.audioUrl, new Response(blob, {
                status: 200,
                headers: {
                    'content-type': contentType
                }
            }));
        } else {
            this.memoryBlobs.set(key, blob);
        }
        const record = {
            episodeKey: key,
            audioUrl: episode.audioUrl,
            title: episode.title,
            showTitle: episode.showTitle,
            mimeType: contentType,
            sizeBytes: blob.size,
            downloadedAt: new Date().toISOString()
        };
        await this.store.recordOffline(record);
        return record;
    }
    async resolvePlayableUrl(episode) {
        const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
        const existingUrl = this.objectUrls.get(key);
        if (existingUrl) {
            return {
                url: existingUrl,
                offline: true
            };
        }
        let blob = this.memoryBlobs.get(key) ?? null;
        if (!blob) {
            const cache = await this.openCache();
            if (cache) {
                const cached = await cache.match(episode.audioUrl);
                if (cached) {
                    blob = await cached.blob();
                }
            }
        }
        if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const objectUrl = URL.createObjectURL(blob);
            this.objectUrls.set(key, objectUrl);
            return {
                url: objectUrl,
                offline: true
            };
        }
        return {
            url: episode.audioUrl,
            offline: false
        };
    }
    async removeDownload(episodeKey) {
        const record = this.store.getOfflineRecord(episodeKey);
        const existingUrl = this.objectUrls.get(episodeKey);
        if (existingUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(existingUrl);
        }
        this.objectUrls.delete(episodeKey);
        this.memoryBlobs.delete(episodeKey);
        if (record) {
            const cache = await this.openCache();
            if (cache) {
                await cache.delete(record.audioUrl);
            }
        }
        return this.store.removeOfflineRecord(episodeKey);
    }
    dispose() {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            for (const objectUrl of this.objectUrls.values()){
                URL.revokeObjectURL(objectUrl);
            }
        }
        this.objectUrls.clear();
    }
}

export const manifest = {
    id: 'mplay3r.podcasts',
    name: 'Podcasts & Streaming Sources',
    version: '1.0.0',
    description: 'Search and subscribe to RSS/Atom podcasts (iTunes & Podcast Index), resolve streaming platform links to open RSS feeds, resume playback per episode, control speed (0.75x-2x), skip -15s/+30s, download episodes offline, and connect open MediaSourceProvider addons.',
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
let activeOfflineManager = null;
const INPUT_CSS = 'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.76rem';
const ROW_CSS = 'display:flex;align-items:center;justify-content:space-between;gap:0.45rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
const LIST_CSS = 'display:flex;flex-direction:column;gap:0.3rem;max-height:14rem;overflow-y:auto';
function makeEl(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}
function makeBtn(label, onClick, variant = 'ghost', ariaLabel) {
    const styles = {
        ghost: 'padding:0.18rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.7rem;cursor:pointer',
        accent: 'padding:0.18rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
        solid: 'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer'
    };
    const btn = makeEl('button', styles[variant], label);
    btn.type = 'button';
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClick);
    return btn;
}
function makeMetaBlock(title, subtitle) {
    const meta = makeEl('div', 'min-width:0;flex:1');
    meta.append(makeEl('div', 'font-size:0.79rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title), makeEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', subtitle));
    return meta;
}
function applyRateToPlayerTarget(playerTarget, rate) {
    if (typeof document === 'undefined' || !playerTarget) {
        return;
    }
    const host = document.querySelector(playerTarget);
    if (!host) {
        return;
    }
    if (typeof host.setPlaybackRate === 'function') {
        host.setPlaybackRate(rate);
        return;
    }
    const media = host.querySelector('audio');
    if (media) {
        media.playbackRate = rate;
        if ('preservesPitch' in media) {
            media.preservesPitch = true;
        }
    }
}
function guessAudioFormat(audioUrl, mimeType) {
    const mime = (mimeType || '').toLowerCase();
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'M4A';
    if (mime.includes('ogg') || mime.includes('opus')) return 'OGG';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'MP3';
    const extMatch = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(audioUrl);
    return extMatch ? extMatch[1].toUpperCase() : 'PODCAST';
}
export const plugin = {
    manifest,
    async activate (ctx) {
        const fetcher = (input, init)=>ctx.fetch(input, init);
        const store = new PodcastStateStore(ctx.storage);
        await store.load();
        const offlineManager = new OfflineEpisodeManager(store);
        activeOfflineManager = offlineManager;
        const controller = new PodcastPlaybackController(store, {
            seek: (seconds)=>ctx.playback.seek(seconds),
            getCurrentTime: ()=>ctx.getState().currentTime,
            getDuration: ()=>ctx.getState().duration,
            applyPlaybackRate: (rate)=>applyRateToPlayerTarget(ctx.playerTarget, rate)
        });
        ctx.registerProvider('media-source', createPodcastMediaSourceProvider(fetcher));
        let controlsSlotEl = null;
        const renderControlsSlot = ()=>{
            if (!controlsSlotEl) {
                return;
            }
            const pState = controller.getState();
            if (!pState.activeEpisode) {
                controlsSlotEl.textContent = '';
                controlsSlotEl.style.display = 'none';
                return;
            }
            controlsSlotEl.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:0.35rem;font-size:0.72rem';
            controlsSlotEl.innerHTML = '';
            const backBtn = makeBtn('-15s', ()=>void controller.skipBackward(15).then(()=>renderControlsSlot()), 'ghost', 'Skip back 15 seconds');
            const speedBtn = makeBtn(`${pState.playbackRate}×`, ()=>void controller.cycleRate().then((rate)=>{
                    renderControlsSlot();
                    void ctx.notify(`Playback speed: ${rate}×`);
                }), 'accent', 'Cycle podcast playback speed');
            const fwdBtn = makeBtn('+30s', ()=>void controller.skipForward(30).then(()=>renderControlsSlot()), 'ghost', 'Skip forward 30 seconds');
            controlsSlotEl.append(backBtn, speedBtn, fwdBtn);
            if (pState.activeChapter) {
                const chap = makeEl('span', 'color:var(--mp-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14rem', `§ ${pState.activeChapter.title}`);
                chap.title = `Active chapter (${formatPodcastTime(pState.activeChapter.startSeconds)})`;
                controlsSlotEl.append(chap);
            }
        };
        const playEpisode = async (episode)=>{
            const resolved = await offlineManager.resolvePlayableUrl(episode);
            controller.registerEpisode(episode, resolved.url);
            await ctx.playlist.clearPlaylist();
            const added = await ctx.playlist.addTracks([
                {
                    src: resolved.url,
                    title: episode.title,
                    artist: episode.showTitle,
                    album: resolved.offline ? `${episode.showTitle} (Offline)` : episode.showTitle,
                    duration: episode.duration,
                    format: guessAudioFormat(episode.audioUrl, episode.mimeType),
                    isObjectUrl: resolved.offline
                }
            ], true);
            if (added[0]) {
                await controller.onTrackChanged(added[0]);
                renderControlsSlot();
            }
            const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
            const resumeAt = store.getResumePosition(key);
            const suffix = resumeAt > 0 ? ` (resuming at ${formatPodcastTime(resumeAt)})` : '';
            await ctx.notify(`Playing ${episode.title}${suffix}`, 'success');
        };
        const playExternalMediaItem = async (item)=>{
            await ctx.playlist.clearPlaylist();
            await ctx.playlist.addTracks([
                {
                    src: item.streamUrl,
                    title: item.title,
                    artist: item.artist,
                    album: item.album,
                    duration: item.duration,
                    format: guessAudioFormat(item.streamUrl)
                }
            ], true);
            await ctx.notify(`Playing ${item.title}`, 'success');
        };
        ctx.on('trackChange', ({ track })=>{
            void controller.onTrackChanged(track).then(()=>renderControlsSlot());
        });
        ctx.on('timeUpdate', ({ currentTime, duration })=>{
            const prevChapter = controller.getState().activeChapter?.title;
            void controller.onTimeUpdate(currentTime, duration).then((nextChapter)=>{
                if (nextChapter?.title !== prevChapter) {
                    renderControlsSlot();
                }
            });
        });
        ctx.registerSlot({
            id: 'podcast-controls',
            slot: 'track-info',
            mount (container) {
                controlsSlotEl = container;
                renderControlsSlot();
                return ()=>{
                    controlsSlotEl = null;
                };
            }
        });
        ctx.registerSlot({
            id: 'podcasts-panel',
            slot: 'panel',
            title: 'Podcasts',
            mount (container) {
                let activeSourceId = 'subscriptions';
                let query = '';
                let loading = false;
                let statusMessage = '';
                let searchItems = [];
                let openedFeed = null;
                let expandedEpisodeKey = null;
                const downloadingKeys = new Set();
                const openFeed = async (feedUrl, fallbackTitle)=>{
                    loading = true;
                    statusMessage = `Loading ${fallbackTitle || feedUrl}…`;
                    renderPanel();
                    try {
                        openedFeed = await fetchAndParsePodcastFeed(feedUrl, fetcher);
                        statusMessage = '';
                    } catch (err) {
                        statusMessage = err instanceof Error ? err.message : 'Unable to load podcast feed.';
                        await ctx.notify(statusMessage, 'error');
                    } finally{
                        loading = false;
                        renderPanel();
                    }
                };
                const resolveAndOpenUrl = async (rawUrl)=>{
                    const trimmed = rawUrl.trim();
                    if (!trimmed) return;
                    loading = true;
                    statusMessage = 'Resolving podcast / platform link…';
                    renderPanel();
                    try {
                        const resolved = await resolvePlatformUrlToFeed(trimmed, fetcher);
                        if (!resolved) {
                            const providers = ctx.getProviders('media-source').filter((p)=>p.id !== 'mplay3r-podcasts');
                            for (const provider of providers){
                                if (!provider.resolveUrl) continue;
                                const resolvedItems = await provider.resolveUrl(trimmed);
                                if (resolvedItems.length > 0) {
                                    openedFeed = null;
                                    searchItems = resolvedItems;
                                    activeSourceId = provider.id;
                                    statusMessage = `Resolved via ${provider.name}`;
                                    loading = false;
                                    renderPanel();
                                    return;
                                }
                            }
                            throw new Error('Could not resolve an open RSS audio feed from that URL.');
                        }
                        openedFeed = await fetchAndParsePodcastFeed(resolved.feedUrl, fetcher);
                        statusMessage = resolved.kind === 'feed' ? '' : `Resolved ${resolved.platform} link → RSS (${openedFeed.episodes.length} episodes)`;
                    } catch (err) {
                        statusMessage = err instanceof Error ? err.message : 'Failed to resolve URL.';
                        await ctx.notify(statusMessage, 'error');
                    } finally{
                        loading = false;
                        renderPanel();
                    }
                };
                const runSearch = async ()=>{
                    openedFeed = null;
                    if (activeSourceId === 'subscriptions' || activeSourceId === 'offline' || !query.trim()) {
                        searchItems = [];
                        statusMessage = '';
                        renderPanel();
                        return;
                    }
                    loading = true;
                    statusMessage = 'Searching…';
                    renderPanel();
                    const providers = ctx.getProviders('media-source').filter((p)=>activeSourceId === 'all' || p.id === activeSourceId);
                    const collected = [];
                    for (const provider of providers){
                        try {
                            collected.push(...await provider.search(query, {
                                limit: 15
                            }));
                        } catch  {}
                    }
                    searchItems = collected;
                    loading = false;
                    statusMessage = collected.length === 0 ? 'No podcasts or streams matched your search.' : '';
                    renderPanel();
                };
                const renderFeedEpisodes = (feed)=>{
                    const box = makeEl('div', 'display:flex;flex-direction:column;gap:0.4rem');
                    const header = makeEl('div', ROW_CSS);
                    header.append(makeMetaBlock(feed.title, [
                        feed.author,
                        `${feed.episodes.length} episodes`
                    ].filter(Boolean).join(' · ')));
                    const actions = makeEl('div', 'display:flex;gap:0.3rem');
                    const subscribed = store.isSubscribed(feed.feedUrl);
                    actions.append(makeBtn('← Back', ()=>{
                        openedFeed = null;
                        renderPanel();
                    }), makeBtn(subscribed ? 'Subscribed ✓' : '+ Subscribe', ()=>{
                        void (subscribed ? store.unsubscribe(feed.feedUrl) : store.subscribe({
                            feedUrl: feed.feedUrl,
                            title: feed.title,
                            author: feed.author,
                            artworkUrl: feed.artworkUrl,
                            episodeCount: feed.episodes.length
                        })).then(()=>renderPanel());
                    }, subscribed ? 'accent' : 'solid'));
                    header.append(actions);
                    box.append(header);
                    const epList = makeEl('div', LIST_CSS);
                    for (const ep of feed.episodes.slice(0, 50)){
                        const key = makeEpisodeKey(ep.feedUrl, ep.id, ep.audioUrl);
                        const prog = store.getProgress(key);
                        const resumeAt = store.getResumePosition(key);
                        const isOffline = store.isOffline(key);
                        const isDownloading = downloadingKeys.has(key);
                        const row = makeEl('div', 'display:flex;flex-direction:column;gap:0.25rem;padding:0.36rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)');
                        const top = makeEl('div', 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem');
                        const sub = [
                            ep.publishedAt ? ep.publishedAt.slice(0, 10) : '',
                            ep.duration ? formatPodcastTime(ep.duration) : '',
                            resumeAt > 0 ? `Resume ${formatPodcastTime(resumeAt)}` : '',
                            ep.chapters.length > 0 ? `${ep.chapters.length} ch.` : '',
                            isOffline ? 'Offline' : ''
                        ].filter(Boolean).join(' · ');
                        top.append(makeMetaBlock(prog?.completed ? `✓ ${ep.title}` : ep.title, sub));
                        const btns = makeEl('div', 'display:flex;gap:0.25rem');
                        if (ep.description || ep.chapters.length > 0) {
                            btns.append(makeBtn(expandedEpisodeKey === key ? 'Hide' : 'Notes', ()=>{
                                expandedEpisodeKey = expandedEpisodeKey === key ? null : key;
                                renderPanel();
                            }));
                        }
                        const offlineBtn = makeBtn(isDownloading ? '…' : isOffline ? 'Saved ✓' : '↓', ()=>{
                            if (isOffline) {
                                void offlineManager.removeDownload(key).then(()=>renderPanel());
                                return;
                            }
                            downloadingKeys.add(key);
                            renderPanel();
                            void offlineManager.downloadEpisode(ep, fetcher).then(()=>ctx.notify(`Downloaded "${ep.title}" for offline playback`, 'success')).catch((err)=>ctx.notify(err instanceof Error ? err.message : 'Offline download failed', 'error')).finally(()=>{
                                downloadingKeys.delete(key);
                                renderPanel();
                            });
                        }, isOffline ? 'accent' : 'ghost', isOffline ? 'Remove offline download' : 'Download episode for offline playback');
                        offlineBtn.disabled = isDownloading;
                        btns.append(offlineBtn, makeBtn(resumeAt > 0 ? 'Resume' : 'Play', ()=>void playEpisode(ep), 'accent'));
                        top.append(btns);
                        row.append(top);
                        if (expandedEpisodeKey === key) {
                            const details = makeEl('div', 'font-size:0.72rem;color:var(--mp-text-muted);border-top:1px solid var(--mp-border);padding-top:0.3rem');
                            if (ep.description) {
                                details.append(makeEl('p', 'margin:0 0 0.3rem 0;white-space:pre-line', ep.description.slice(0, 420)));
                            }
                            if (ep.chapters.length > 0) {
                                const chapList = makeEl('div', 'display:flex;flex-wrap:wrap;gap:0.25rem');
                                for (const ch of ep.chapters){
                                    chapList.append(makeBtn(`${formatPodcastTime(ch.startSeconds)} ${ch.title}`, ()=>{
                                        void (async ()=>{
                                            if (controller.getState().activeEpisode?.id !== ep.id) {
                                                await playEpisode(ep);
                                            }
                                            await ctx.playback.seek(ch.startSeconds);
                                        })();
                                    }));
                                }
                                details.append(chapList);
                            }
                            row.append(details);
                        }
                        epList.append(row);
                    }
                    box.append(epList);
                    return box;
                };
                const renderPanel = ()=>{
                    const providers = ctx.getProviders('media-source');
                    container.innerHTML = '';
                    const wrap = makeEl('div', 'display:flex;flex-direction:column;gap:0.5rem');
                    const bar = makeEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem');
                    const sourceSelect = makeEl('select', INPUT_CSS);
                    sourceSelect.setAttribute('aria-label', 'Podcast or media source');
                    const options = [
                        [
                            'subscriptions',
                            `Subscriptions (${store.listSubscriptions().length})`
                        ],
                        [
                            'offline',
                            `Offline (${store.listOffline().length})`
                        ],
                        [
                            'all',
                            `All sources (${providers.length})`
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
                        opt.selected = val === activeSourceId;
                        sourceSelect.append(opt);
                    }
                    sourceSelect.addEventListener('change', ()=>{
                        activeSourceId = sourceSelect.value;
                        void runSearch();
                    });
                    const triggerSearch = ()=>{
                        if (activeSourceId === 'subscriptions' || activeSourceId === 'offline') {
                            activeSourceId = 'mplay3r-podcasts';
                        }
                        void runSearch();
                    };
                    const searchInput = makeEl('input', `${INPUT_CSS};flex:1 1 9rem`);
                    searchInput.type = 'search';
                    searchInput.placeholder = 'Search podcasts / open sources…';
                    searchInput.value = query;
                    searchInput.addEventListener('input', ()=>{
                        query = searchInput.value;
                    });
                    searchInput.addEventListener('keydown', (e)=>{
                        if (e.key === 'Enter') triggerSearch();
                    });
                    bar.append(sourceSelect, searchInput, makeBtn(loading ? '…' : 'Search', triggerSearch, 'solid'));
                    const urlForm = makeEl('form', 'display:flex;gap:0.35rem');
                    const urlInput = makeEl('input', `${INPUT_CSS};flex:1`);
                    urlInput.type = 'url';
                    urlInput.placeholder = 'RSS/Atom feed, Apple Podcasts or Spotify show URL…';
                    const openBtn = makeEl('button', `${INPUT_CSS};border-radius:999px;cursor:pointer`, 'Open URL');
                    openBtn.type = 'submit';
                    urlForm.addEventListener('submit', (event)=>{
                        event.preventDefault();
                        const raw = urlInput.value.trim();
                        if (!raw) return;
                        urlInput.value = '';
                        void resolveAndOpenUrl(raw);
                    });
                    urlForm.append(urlInput, openBtn);
                    wrap.append(bar, urlForm);
                    if (statusMessage) {
                        wrap.append(makeEl('div', 'font-size:0.73rem;color:var(--mp-text-muted)', statusMessage));
                    }
                    if (openedFeed) {
                        wrap.append(renderFeedEpisodes(openedFeed));
                    } else {
                        const list = makeEl('div', LIST_CSS);
                        const appendEmpty = (msg)=>list.append(makeEl('p', 'margin:0.3rem 0;font-size:0.76rem;color:var(--mp-text-muted)', msg));
                        if (activeSourceId === 'subscriptions') {
                            const subs = store.listSubscriptions();
                            if (subs.length === 0) {
                                appendEmpty('No podcast subscriptions yet. Search a show or paste an RSS / Apple / Spotify link above.');
                            } else {
                                for (const sub of subs){
                                    const row = makeEl('div', ROW_CSS);
                                    row.append(makeMetaBlock(sub.title, [
                                        sub.author,
                                        sub.episodeCount ? `${sub.episodeCount} ep.` : ''
                                    ].filter(Boolean).join(' · ')), makeBtn('Episodes', ()=>void openFeed(sub.feedUrl, sub.title), 'accent'));
                                    list.append(row);
                                }
                            }
                        } else if (activeSourceId === 'offline') {
                            const recs = store.listOffline();
                            if (recs.length === 0) {
                                appendEmpty('No episodes downloaded for offline playback yet.');
                            } else {
                                for (const rec of recs){
                                    const row = makeEl('div', ROW_CSS);
                                    const btns = makeEl('div', 'display:flex;gap:0.25rem');
                                    btns.append(makeBtn('✕', ()=>void offlineManager.removeDownload(rec.episodeKey).then(()=>renderPanel()), 'ghost', `Delete offline copy of ${rec.title}`), makeBtn('Play', ()=>{
                                        const [feedPart, idPart] = rec.episodeKey.split('::');
                                        void playEpisode({
                                            id: idPart || rec.audioUrl,
                                            feedUrl: feedPart || 'direct',
                                            showTitle: rec.showTitle,
                                            title: rec.title,
                                            audioUrl: rec.audioUrl,
                                            mimeType: rec.mimeType,
                                            chapters: []
                                        });
                                    }, 'accent'));
                                    row.append(makeMetaBlock(rec.title, `${rec.showTitle} · ${(rec.sizeBytes / (1024 * 1024)).toFixed(1)} MB`), btns);
                                    list.append(row);
                                }
                            }
                        } else if (searchItems.length === 0 && !loading) {
                            appendEmpty('Type a show, creator, or track name to search installed media sources.');
                        } else {
                            for (const item of searchItems){
                                const isPodcastFeed = item.providerId === 'mplay3r-podcasts';
                                const row = makeEl('div', ROW_CSS);
                                row.append(makeMetaBlock(item.title, [
                                    item.artist,
                                    item.album,
                                    item.providerId
                                ].filter(Boolean).join(' · ')), makeBtn(isPodcastFeed ? 'Episodes' : 'Play', ()=>void (isPodcastFeed ? openFeed(item.streamUrl, item.title) : playExternalMediaItem(item)), 'accent'));
                                list.append(row);
                            }
                        }
                        wrap.append(list);
                    }
                    container.append(wrap);
                };
                renderPanel();
                return ()=>{
                    container.innerHTML = '';
                };
            }
        });
    },
    deactivate () {
        activeOfflineManager?.dispose();
        activeOfflineManager = null;
    }
};
export default plugin;
