// mPlay3r addon bundle: mplay3r.wsz-skins@1.0.0 (generated from plugins/wsz-skins/src)

const DEFAULT_PLEDIT = {
    normal: '#00ff00',
    current: '#ffffff',
    normalBg: '#000000',
    selectedBg: '#0000c6',
    mbBg: '#000000',
    mbFg: '#00ff00',
    font: 'Arial'
};
const DEFAULT_VISCOLOR_RGB = [
    'rgb(0,0,0)',
    'rgb(24,33,41)',
    'rgb(239,49,16)',
    'rgb(206,41,16)',
    'rgb(214,90,0)',
    'rgb(214,102,0)',
    'rgb(214,115,0)',
    'rgb(198,123,8)',
    'rgb(222,165,24)',
    'rgb(214,181,33)',
    'rgb(189,222,41)',
    'rgb(148,222,33)',
    'rgb(41,206,16)',
    'rgb(50,190,16)',
    'rgb(57,181,16)',
    'rgb(49,156,8)',
    'rgb(41,148,0)',
    'rgb(24,132,8)',
    'rgb(255,255,255)',
    'rgb(214,214,222)',
    'rgb(181,189,189)',
    'rgb(160,170,175)',
    'rgb(148,156,165)',
    'rgb(150,150,150)'
];
function normalizeWszHex(raw, fallback) {
    if (!raw) return fallback;
    const cleaned = raw.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(cleaned)) {
        return `#${cleaned.toLowerCase()}`;
    }
    if (/^[0-9a-f]{3}$/i.test(cleaned)) {
        return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`.toLowerCase();
    }
    return fallback;
}
function parsePleditTxt(text) {
    const result = {
        ...DEFAULT_PLEDIT
    };
    if (!text) return result;
    for (const rawLine of text.split(/\r?\n/)){
        const line = rawLine.trim();
        if (!line || line.startsWith('[') || line.startsWith(';') || line.startsWith('//')) {
            continue;
        }
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim().toLowerCase();
        const value = line.slice(eqIdx + 1).replace(/\s+(?:;|\/\/).*$/, '').trim().replace(/^["']|["']$/g, '');
        switch(key){
            case 'normal':
                result.normal = normalizeWszHex(value, result.normal);
                break;
            case 'current':
                result.current = normalizeWszHex(value, result.current);
                break;
            case 'normalbg':
                result.normalBg = normalizeWszHex(value, result.normalBg);
                break;
            case 'selectedbg':
                result.selectedBg = normalizeWszHex(value, result.selectedBg);
                break;
            case 'mbbg':
                result.mbBg = normalizeWszHex(value, result.mbBg);
                break;
            case 'mbfg':
                result.mbFg = normalizeWszHex(value, result.mbFg);
                break;
            case 'font':
                if (value && /^[A-Za-z0-9 _.-]{1,48}$/.test(value)) {
                    result.font = value;
                }
                break;
            default:
                break;
        }
    }
    return result;
}
function parseViscolorTxt(text) {
    const parsed = [
        ...DEFAULT_VISCOLOR_RGB
    ];
    if (text) {
        let rowIdx = 0;
        for (const rawLine of text.split(/\r?\n/)){
            if (rowIdx >= 24) break;
            const line = rawLine.replace(/\/\/.*$/, '').replace(/;.*$/, '').trim();
            if (!line) continue;
            const match = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(line);
            if (match) {
                const r = Math.min(255, Math.max(0, Number.parseInt(match[1], 10)));
                const g = Math.min(255, Math.max(0, Number.parseInt(match[2], 10)));
                const b = Math.min(255, Math.max(0, Number.parseInt(match[3], 10)));
                parsed[rowIdx] = `rgb(${r},${g},${b})`;
                rowIdx += 1;
            }
        }
    }
    return {
        background: parsed[0],
        gridDots: parsed[1],
        spectrum: parsed.slice(2, 18),
        oscilloscope: parsed.slice(18, 23),
        peak: parsed[23]
    };
}
function inspectBmpHeader(bytes) {
    if (!bytes || bytes.byteLength < 26) {
        return null;
    }
    if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dibSize = view.getUint32(14, true);
    if (dibSize < 12) {
        return null;
    }
    let width;
    let height;
    let bitsPerPixel;
    if (dibSize === 12) {
        width = view.getUint16(18, true);
        height = view.getUint16(20, true);
        bitsPerPixel = view.getUint16(24, true);
    } else {
        if (bytes.byteLength < 30) return null;
        width = view.getInt32(18, true);
        height = Math.abs(view.getInt32(22, true));
        bitsPerPixel = view.getUint16(28, true);
    }
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        return null;
    }
    return {
        width,
        height,
        bitsPerPixel,
        byteLength: bytes.byteLength
    };
}

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;
const MAX_WSZ_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
function readU16LE(view, offset) {
    return view.getUint16(offset, true);
}
function readU32LE(view, offset) {
    return view.getUint32(offset, true);
}
async function inflateRawBytes(compressed) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream is unavailable for deflated .wsz entries.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    void writer.write(copy).then(()=>writer.close());
    const reader = ds.readable.getReader();
    const chunks = [];
    let total = 0;
    for(;;){
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            total += value.byteLength;
            if (total > MAX_WSZ_UNCOMPRESSED_BYTES) {
                throw new Error('Decompressed .wsz entry exceeds safety size limit.');
            }
            chunks.push(value);
        }
    }
    const merged = new Uint8Array(total);
    let pos = 0;
    for (const chunk of chunks){
        merged.set(chunk, pos);
        pos += chunk.byteLength;
    }
    return merged;
}
function normalizeWszEntryName(rawName) {
    const normalized = rawName.replace(/\\/g, '/').trim();
    if (!normalized || normalized.endsWith('/') || normalized.includes('\0')) {
        return null;
    }
    const parts = normalized.split('/').filter(Boolean);
    if (parts.some((p)=>p === '..')) {
        return null;
    }
    const basename = parts[parts.length - 1];
    return basename ? basename.toLowerCase() : null;
}
async function extractWszArchive(bytes) {
    const files = new Map();
    const warnings = [];
    if (!bytes || bytes.byteLength < 22) {
        return {
            ok: false,
            files,
            warnings,
            error: 'Archive is too small to be a valid .wsz (ZIP) file.'
        };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minPos = Math.max(0, bytes.byteLength - 65557);
    let eocdOffset = -1;
    for(let i = bytes.byteLength - 22; i >= minPos; i -= 1){
        if (readU32LE(view, i) === ZIP_EOCD_SIG) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset < 0) {
        return {
            ok: false,
            files,
            warnings,
            error: 'Invalid .wsz archive: ZIP End-of-Central-Directory signature missing.'
        };
    }
    const totalEntries = readU16LE(view, eocdOffset + 10);
    const cdSize = readU32LE(view, eocdOffset + 12);
    const cdOffset = readU32LE(view, eocdOffset + 16);
    if (cdOffset + cdSize > bytes.byteLength) {
        return {
            ok: false,
            files,
            warnings,
            error: 'Corrupted .wsz archive: Central Directory extends past EOF.'
        };
    }
    const decoder = new TextDecoder('utf-8', {
        fatal: false
    });
    let cursor = cdOffset;
    let totalExtractedBytes = 0;
    for(let idx = 0; idx < totalEntries; idx += 1){
        if (cursor + 46 > bytes.byteLength) {
            warnings.push(`Truncated central directory entry at index ${idx}.`);
            break;
        }
        if (readU32LE(view, cursor) !== ZIP_CD_SIG) {
            warnings.push(`Unexpected central directory header signature at index ${idx}.`);
            break;
        }
        const method = readU16LE(view, cursor + 10);
        const compressedSize = readU32LE(view, cursor + 20);
        const uncompressedSize = readU32LE(view, cursor + 24);
        const nameLen = readU16LE(view, cursor + 28);
        const extraLen = readU16LE(view, cursor + 30);
        const commentLen = readU16LE(view, cursor + 32);
        const localHeaderOffset = readU32LE(view, cursor + 42);
        const nameEnd = cursor + 46 + nameLen;
        if (nameEnd > bytes.byteLength) {
            warnings.push(`Truncated filename in archive entry ${idx}.`);
            break;
        }
        const rawName = decoder.decode(bytes.subarray(cursor + 46, nameEnd));
        cursor = nameEnd + extraLen + commentLen;
        const cleanName = normalizeWszEntryName(rawName);
        if (!cleanName) {
            continue;
        }
        if (totalExtractedBytes + uncompressedSize > MAX_WSZ_UNCOMPRESSED_BYTES) {
            warnings.push(`Skipped "${cleanName}": exceeds safe archive size limit.`);
            continue;
        }
        if (localHeaderOffset + 30 > bytes.byteLength || readU32LE(view, localHeaderOffset) !== ZIP_LOCAL_SIG) {
            warnings.push(`Skipped "${cleanName}": invalid local ZIP header.`);
            continue;
        }
        const localNameLen = readU16LE(view, localHeaderOffset + 26);
        const localExtraLen = readU16LE(view, localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > bytes.byteLength) {
            warnings.push(`Skipped "${cleanName}": compressed payload truncated.`);
            continue;
        }
        const slice = bytes.subarray(dataStart, dataEnd);
        try {
            let content;
            if (method === 0) {
                content = new Uint8Array(slice);
            } else if (method === 8) {
                content = await inflateRawBytes(slice);
            } else {
                warnings.push(`Skipped "${cleanName}": unsupported ZIP compression method ${method}.`);
                continue;
            }
            totalExtractedBytes += content.byteLength;
            files.set(cleanName, content);
        } catch (err) {
            warnings.push(`Skipped "${cleanName}": ${err instanceof Error ? err.message : 'decompression failed'}.`);
        }
    }
    if (files.size === 0) {
        return {
            ok: false,
            files,
            warnings,
            error: 'No readable files could be extracted from the .wsz archive.'
        };
    }
    return {
        ok: true,
        files,
        warnings
    };
}

const WINAMP_MAIN_SIZE = {
    width: 275,
    height: 116
};
const WINAMP_EQ_SIZE = {
    width: 275,
    height: 116
};
const WINAMP_CBUTTONS_SPRITES = {
    previous: {
        normal: {
            x: 0,
            y: 0,
            w: 23,
            h: 18
        },
        pressed: {
            x: 0,
            y: 18,
            w: 23,
            h: 18
        },
        action: 'previous',
        label: 'Previous'
    },
    play: {
        normal: {
            x: 23,
            y: 0,
            w: 23,
            h: 18
        },
        pressed: {
            x: 23,
            y: 18,
            w: 23,
            h: 18
        },
        action: 'play',
        label: 'Play'
    },
    pause: {
        normal: {
            x: 46,
            y: 0,
            w: 23,
            h: 18
        },
        pressed: {
            x: 46,
            y: 18,
            w: 23,
            h: 18
        },
        action: 'pause',
        label: 'Pause'
    },
    stop: {
        normal: {
            x: 69,
            y: 0,
            w: 23,
            h: 18
        },
        pressed: {
            x: 69,
            y: 18,
            w: 23,
            h: 18
        },
        action: 'stop',
        label: 'Stop'
    },
    next: {
        normal: {
            x: 92,
            y: 0,
            w: 22,
            h: 18
        },
        pressed: {
            x: 92,
            y: 18,
            w: 22,
            h: 18
        },
        action: 'next',
        label: 'Next'
    },
    eject: {
        normal: {
            x: 114,
            y: 0,
            w: 22,
            h: 16
        },
        pressed: {
            x: 114,
            y: 16,
            w: 22,
            h: 16
        },
        action: 'openFilePicker',
        label: 'Open Files'
    }
};
function sliceSpriteCss(imageUrl, rect) {
    return `width:${rect.w}px;height:${rect.h}px;padding:0;border:0;cursor:pointer;` + `background-color:transparent;background-image:url("${imageUrl}");` + `background-position:-${rect.x}px -${rect.y}px;background-repeat:no-repeat;` + `image-rendering:pixelated;color:transparent;overflow:hidden`;
}
function bytesToBmpUrl(bytes, createdBlobUrls) {
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const url = URL.createObjectURL(new Blob([
            copy
        ], {
            type: 'image/bmp'
        }));
        createdBlobUrls.push(url);
        return url;
    }
    let binary = '';
    for (const b of bytes)binary += String.fromCharCode(b);
    return `data:image/bmp;base64,${btoa(binary)}`;
}
async function loadWszSkin(archiveBytes, skinName = 'Custom .wsz Skin') {
    const createdBlobUrls = [];
    const dispose = ()=>{
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            for (const u of createdBlobUrls)URL.revokeObjectURL(u);
        }
        createdBlobUrls.length = 0;
    };
    const extracted = await extractWszArchive(archiveBytes);
    const warnings = [
        ...extracted.warnings
    ];
    const decoder = new TextDecoder('utf-8', {
        fatal: false
    });
    if (!extracted.ok) {
        return {
            ok: false,
            name: skinName,
            pledit: parsePleditTxt(undefined),
            viscolor: parseViscolorTxt(undefined),
            sprites: {},
            warnings,
            error: extracted.error,
            dispose
        };
    }
    const pleditBytes = extracted.files.get('pledit.txt');
    const viscolorBytes = extracted.files.get('viscolor.txt');
    const pledit = parsePleditTxt(pleditBytes ? decoder.decode(pleditBytes) : undefined);
    const viscolor = parseViscolorTxt(viscolorBytes ? decoder.decode(viscolorBytes) : undefined);
    if (!pleditBytes) warnings.push('pledit.txt missing — using classic Winamp playlist colors.');
    if (!viscolorBytes) warnings.push('viscolor.txt missing — using classic Winamp visualizer palette.');
    const sprites = {};
    const bmpKeys = [
        [
            'main',
            'main.bmp',
            true
        ],
        [
            'cbuttons',
            'cbuttons.bmp',
            true
        ],
        [
            'eqmain',
            'eqmain.bmp',
            false
        ],
        [
            'shufrep',
            'shufrep.bmp',
            false
        ],
        [
            'posbar',
            'posbar.bmp',
            false
        ],
        [
            'volume',
            'volume.bmp',
            false
        ],
        [
            'titlebar',
            'titlebar.bmp',
            false
        ]
    ];
    for (const [prop, filename, warnIfMissing] of bmpKeys){
        const raw = extracted.files.get(filename);
        if (!raw) {
            if (warnIfMissing) warnings.push(`${filename} missing — using fallback skin geometry.`);
            continue;
        }
        const info = inspectBmpHeader(raw);
        if (!info) {
            warnings.push(`${filename} has an invalid or corrupted BMP header — ignored.`);
            continue;
        }
        sprites[prop] = {
            name: filename,
            url: bytesToBmpUrl(raw, createdBlobUrls),
            info
        };
    }
    return {
        ok: true,
        name: skinName,
        pledit,
        viscolor,
        sprites,
        warnings,
        dispose
    };
}
function formatWszClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function mountWszSkinLayout(skin, ctx, container, playerTarget, onExitSkin) {
    container.innerHTML = '';
    const shell = document.createElement('div');
    shell.style.cssText = `display:inline-flex;flex-direction:column;gap:4px;font-family:${skin.pledit.font},sans-serif;user-select:none`;
    shell.setAttribute('role', 'region');
    shell.setAttribute('aria-label', `Winamp skin: ${skin.name}`);
    const mainWin = document.createElement('div');
    mainWin.style.cssText = `position:relative;width:${WINAMP_MAIN_SIZE.width}px;height:${WINAMP_MAIN_SIZE.height}px;` + `border:1px solid #2b2f3d;overflow:hidden;image-rendering:pixelated;` + (skin.sprites.main ? `background:url("${skin.sprites.main.url}") top left no-repeat;` : 'background:linear-gradient(180deg,#2c3140,#181b24);');
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.textContent = '×';
    exitBtn.title = 'Exit .wsz skin (return to Minimal without stopping audio)';
    exitBtn.style.cssText = 'position:absolute;top:2px;right:3px;width:14px;height:14px;line-height:10px;padding:0;border:0;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;cursor:pointer';
    exitBtn.addEventListener('click', onExitSkin);
    const clockEl = document.createElement('div');
    clockEl.style.cssText = `position:absolute;top:24px;left:38px;font-family:monospace;font-size:15px;font-weight:700;color:${skin.pledit.normal};text-shadow:0 0 4px rgba(0,0,0,0.8)`;
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `position:absolute;top:25px;left:110px;width:154px;font-size:10px;color:${skin.pledit.normal};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
    const visStrip = document.createElement('div');
    visStrip.style.cssText = `position:absolute;top:43px;left:24px;width:76px;height:16px;display:flex;align-items:flex-end;gap:1px;padding:1px;background:${skin.viscolor.background}`;
    for(let i = 0; i < 12; i += 1){
        const bar = document.createElement('span');
        const col = skin.viscolor.spectrum[Math.min(skin.viscolor.spectrum.length - 1, i)] || '#00ff00';
        bar.style.cssText = `flex:1;height:${25 + i * 19 % 70}%;background:${col}`;
        visStrip.append(bar);
    }
    const cbuttonsRow = document.createElement('div');
    cbuttonsRow.style.cssText = 'position:absolute;left:16px;top:88px;display:flex;align-items:center;gap:0';
    for (const [key, spec] of Object.entries(WINAMP_CBUTTONS_SPRITES)){
        const trigger = document.createElement('ds-trigger');
        trigger.setAttribute('target', playerTarget);
        trigger.setAttribute('action', spec.action);
        trigger.setAttribute('label', spec.label);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', spec.label);
        if (skin.sprites.cbuttons) {
            btn.style.cssText = sliceSpriteCss(skin.sprites.cbuttons.url, spec.normal);
            btn.textContent = spec.label;
        } else {
            btn.textContent = key === 'previous' ? '⏮' : key === 'play' ? '▶' : key === 'pause' ? '⏸' : key === 'stop' ? '⏹' : key === 'next' ? '⏭' : '⏏';
            btn.style.cssText = `width:${spec.normal.w}px;height:${spec.normal.h}px;padding:0;font-size:9px;background:#2f3547;color:#eef2ff;border:1px solid #535b73;cursor:pointer`;
        }
        trigger.append(btn);
        cbuttonsRow.append(trigger);
    }
    mainWin.append(exitBtn, clockEl, titleEl, visStrip, cbuttonsRow);
    shell.append(mainWin);
    if (skin.sprites.eqmain) {
        const eqWin = document.createElement('div');
        eqWin.style.cssText = `width:${WINAMP_EQ_SIZE.width}px;height:${WINAMP_EQ_SIZE.height}px;` + `background:url("${skin.sprites.eqmain.url}") top left no-repeat;image-rendering:pixelated;border:1px solid #2b2f3d`;
        eqWin.setAttribute('aria-label', 'Winamp Equalizer Skin Graphic');
        shell.append(eqWin);
    }
    const plWin = document.createElement('div');
    plWin.style.cssText = `width:${WINAMP_MAIN_SIZE.width}px;max-height:110px;overflow-y:auto;padding:4px 6px;font-size:11px;` + `background:${skin.pledit.normalBg};color:${skin.pledit.normal};border:1px solid #2b2f3d;box-sizing:border-box`;
    shell.append(plWin);
    container.append(shell);
    const sync = (snap)=>{
        clockEl.textContent = formatWszClock(snap.currentTime);
        titleEl.textContent = snap.currentTrack ? `${snap.currentTrack.artist ? `${snap.currentTrack.artist} - ` : ''}${snap.currentTrack.title}` : skin.name;
        plWin.innerHTML = '';
        for(let i = 0; i < snap.tracks.length; i += 1){
            const tr = snap.tracks[i];
            const row = document.createElement('div');
            const isCur = i === snap.currentIndex;
            row.style.cssText = `padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` + `color:${isCur ? skin.pledit.current : skin.pledit.normal};` + `background:${isCur ? skin.pledit.selectedBg : 'transparent'}`;
            row.textContent = `${i + 1}. ${tr.artist ? `${tr.artist} - ` : ''}${tr.title}`;
            plWin.append(row);
        }
    };
    sync(ctx.getState());
    const unsubState = ctx.on('stateChange', (snap)=>sync(snap));
    const unsubTime = ctx.on('timeUpdate', ({ currentTime })=>{
        clockEl.textContent = formatWszClock(currentTime);
    });
    const unsubPl = ctx.on('playlistChange', ()=>sync(ctx.getState()));
    return ()=>{
        unsubState();
        unsubTime();
        unsubPl();
        container.innerHTML = '';
    };
}

export const manifest = {
    id: 'mplay3r.wsz-skins',
    name: 'Winamp .wsz Skin Loader',
    version: '1.0.0',
    description: 'Import classic Winamp .wsz skin archives (local file or URL), extract BMP sprites (main.bmp, cbuttons.bmp, eqmain.bmp), parse pledit.txt & viscolor.txt, and render an interactive <ds-trigger> skinned deck.',
    category: 'theme',
    permissions: [
        'theme',
        'ui-slot',
        'network',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
let activeWszSkin = null;
async function applyWszThemeKey(playerTarget, themeKey) {
    if (typeof document === 'undefined' || !playerTarget) return;
    const hostEl = document.querySelector(playerTarget);
    if (!hostEl || typeof hostEl.getPluginHost !== 'function') return;
    const host = await hostEl.getPluginHost();
    host.setActiveTheme(themeKey);
}
export const plugin = {
    manifest,
    async activate (ctx) {
        let loadedSkin = null;
        let statusMessage = 'Drop or select a local .wsz archive (or paste a skin URL) to skin mPlay3r.';
        let skinUrlDraft = '';
        const setLoadedSkin = (next)=>{
            loadedSkin?.dispose();
            loadedSkin = next;
            activeWszSkin = next;
        };
        ctx.registerTheme({
            id: 'wsz-active',
            name: 'Winamp .wsz Skin',
            mountLayout: (container, target)=>{
                if (!loadedSkin || !loadedSkin.ok) {
                    container.textContent = 'No .wsz skin loaded yet.';
                    return ()=>{
                        container.innerHTML = '';
                    };
                }
                return mountWszSkinLayout(loadedSkin, ctx, container, target, ()=>{
                    void applyWszThemeKey(target, null);
                });
            }
        });
        ctx.registerSlot({
            id: 'wsz-skins-panel',
            slot: 'panel',
            title: 'Winamp .wsz',
            mount (container) {
                const importBytes = async (bytes, name)=>{
                    const parsed = await loadWszSkin(bytes, name);
                    if (!parsed.ok) {
                        parsed.dispose();
                        statusMessage = parsed.error || 'Failed to load .wsz archive.';
                        await ctx.notify(statusMessage, 'error');
                        renderPanel();
                        return;
                    }
                    setLoadedSkin(parsed);
                    statusMessage = `Loaded "${parsed.name}" (${Object.keys(parsed.sprites).length} BMP sprites)`;
                    await applyWszThemeKey(ctx.playerTarget, 'mplay3r.wsz-skins:wsz-active');
                    await ctx.notify(`Applied Winamp skin: ${parsed.name}`, 'success');
                    renderPanel();
                };
                const renderPanel = ()=>{
                    container.innerHTML = '';
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.45rem';
                    const fileRow = document.createElement('div');
                    fileRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center';
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.wsz,.zip';
                    fileInput.style.cssText = 'font-size:0.74rem;color:var(--mp-text)';
                    fileInput.addEventListener('change', ()=>{
                        const file = fileInput.files?.[0];
                        if (!file) return;
                        void file.arrayBuffer().then((buf)=>importBytes(new Uint8Array(buf), file.name));
                    });
                    const exitBtn = document.createElement('button');
                    exitBtn.type = 'button';
                    exitBtn.textContent = 'Return to Minimal';
                    exitBtn.style.cssText = 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer';
                    exitBtn.addEventListener('click', ()=>void applyWszThemeKey(ctx.playerTarget, null));
                    fileRow.append(fileInput, exitBtn);
                    const urlForm = document.createElement('form');
                    urlForm.style.cssText = 'display:flex;gap:0.35rem';
                    const urlIn = document.createElement('input');
                    urlIn.type = 'url';
                    urlIn.placeholder = 'https://…/skin.wsz URL';
                    urlIn.value = skinUrlDraft;
                    urlIn.style.cssText = 'flex:1;padding:0.26rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.75rem';
                    urlIn.addEventListener('input', ()=>{
                        skinUrlDraft = urlIn.value;
                    });
                    const fetchBtn = document.createElement('button');
                    fetchBtn.type = 'submit';
                    fetchBtn.textContent = 'Load URL';
                    fetchBtn.style.cssText = 'padding:0.26rem 0.6rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer';
                    urlForm.addEventListener('submit', (event)=>{
                        event.preventDefault();
                        const raw = skinUrlDraft.trim();
                        if (!/^https?:\/\/\S+/i.test(raw)) return;
                        void (async ()=>{
                            try {
                                const res = await ctx.fetch(raw);
                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                const buf = await res.arrayBuffer();
                                const name = raw.split('/').pop() || 'Remote .wsz';
                                await importBytes(new Uint8Array(buf), name);
                            } catch (err) {
                                statusMessage = err instanceof Error ? err.message : 'Unable to download .wsz skin.';
                                await ctx.notify(statusMessage, 'error');
                                renderPanel();
                            }
                        })();
                    });
                    urlForm.append(urlIn, fetchBtn);
                    const statusEl = document.createElement('div');
                    statusEl.style.cssText = 'font-size:0.72rem;color:var(--mp-text-muted)';
                    statusEl.textContent = statusMessage;
                    wrap.append(fileRow, urlForm, statusEl);
                    if (loadedSkin && loadedSkin.ok) {
                        const info = document.createElement('div');
                        info.style.cssText = 'padding:0.4rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);font-size:0.71rem;display:flex;flex-direction:column;gap:0.25rem';
                        const spriteNames = Object.keys(loadedSkin.sprites);
                        const summary = document.createElement('div');
                        summary.textContent = `Sprites: ${spriteNames.length > 0 ? spriteNames.join(', ') : 'none'} · Font: ${loadedSkin.pledit.font}`;
                        info.append(summary);
                        if (loadedSkin.warnings.length > 0) {
                            const warn = document.createElement('div');
                            warn.style.color = 'var(--mp-text-muted)';
                            warn.textContent = `Notes: ${loadedSkin.warnings.join(' | ')}`;
                            info.append(warn);
                        }
                        wrap.append(info);
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
        activeWszSkin?.dispose();
        activeWszSkin = null;
    }
};
export default plugin;
