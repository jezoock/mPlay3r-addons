import type { PlayerSnapshot, PluginContext, PluginDisposer } from '../../../sdk/types';
import { inspectBmpHeader, parsePleditTxt, parseViscolorTxt } from './parsers';
import type { BmpInfo, WszPleditConfig, WszViscolorPalette } from './parsers';
import { extractWszArchive } from './zip';

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WszSpriteAsset {
  name: string;
  url: string;
  info: BmpInfo;
}

export interface LoadedWszSkin {
  ok: boolean;
  name: string;
  pledit: WszPleditConfig;
  viscolor: WszViscolorPalette;
  sprites: {
    main?: WszSpriteAsset;
    cbuttons?: WszSpriteAsset;
    eqmain?: WszSpriteAsset;
    shufrep?: WszSpriteAsset;
    posbar?: WszSpriteAsset;
    volume?: WszSpriteAsset;
    titlebar?: WszSpriteAsset;
  };
  warnings: string[];
  error?: string;
  dispose(): void;
}

export const WINAMP_MAIN_SIZE = { width: 275, height: 116 } as const;
export const WINAMP_EQ_SIZE = { width: 275, height: 116 } as const;

/** Standard Winamp 2.x sprite atlas coordinates inside `cbuttons.bmp` (136x36). */
export const WINAMP_CBUTTONS_SPRITES: Readonly<Record<string, { normal: SpriteRect; pressed: SpriteRect; action: string; label: string }>> = {
  previous: { normal: { x: 0, y: 0, w: 23, h: 18 }, pressed: { x: 0, y: 18, w: 23, h: 18 }, action: 'previous', label: 'Previous' },
  play: { normal: { x: 23, y: 0, w: 23, h: 18 }, pressed: { x: 23, y: 18, w: 23, h: 18 }, action: 'play', label: 'Play' },
  pause: { normal: { x: 46, y: 0, w: 23, h: 18 }, pressed: { x: 46, y: 18, w: 23, h: 18 }, action: 'pause', label: 'Pause' },
  stop: { normal: { x: 69, y: 0, w: 23, h: 18 }, pressed: { x: 69, y: 18, w: 23, h: 18 }, action: 'stop', label: 'Stop' },
  next: { normal: { x: 92, y: 0, w: 22, h: 18 }, pressed: { x: 92, y: 18, w: 22, h: 18 }, action: 'next', label: 'Next' },
  eject: { normal: { x: 114, y: 0, w: 22, h: 16 }, pressed: { x: 114, y: 16, w: 22, h: 16 }, action: 'openFilePicker', label: 'Open Files' },
};

/** Generates pixel-accurate CSS sprite slicing rules for a BMP atlas rectangle. */
export function sliceSpriteCss(imageUrl: string, rect: SpriteRect): string {
  return (
    `width:${rect.w}px;height:${rect.h}px;padding:0;border:0;cursor:pointer;` +
    `background-color:transparent;background-image:url("${imageUrl}");` +
    `background-position:-${rect.x}px -${rect.y}px;background-repeat:no-repeat;` +
    `image-rendering:pixelated;color:transparent;overflow:hidden`
  );
}

function bytesToBmpUrl(bytes: Uint8Array, createdBlobUrls: string[]): string {
  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const url = URL.createObjectURL(new Blob([copy], { type: 'image/bmp' }));
    createdBlobUrls.push(url);
    return url;
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/bmp;base64,${btoa(binary)}`;
}

/**
 * Loads and validates a Winamp `.wsz` skin archive:
 * - Extracts BMP sprites (`main.bmp`, `cbuttons.bmp`, `eqmain.bmp`, etc.) and validates BMP headers.
 * - Parses `pledit.txt` and `viscolor.txt` with classic Winamp fallbacks.
 * - Gracefully handles partial archives (recording warnings) and corrupted archives (`ok: false`).
 */
export async function loadWszSkin(archiveBytes: Uint8Array, skinName = 'Custom .wsz Skin'): Promise<LoadedWszSkin> {
  const createdBlobUrls: string[] = [];
  const dispose = () => {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const u of createdBlobUrls) URL.revokeObjectURL(u);
    }
    createdBlobUrls.length = 0;
  };

  const extracted = await extractWszArchive(archiveBytes);
  const warnings = [...extracted.warnings];
  const decoder = new TextDecoder('utf-8', { fatal: false });

  if (!extracted.ok) {
    return {
      ok: false,
      name: skinName,
      pledit: parsePleditTxt(undefined),
      viscolor: parseViscolorTxt(undefined),
      sprites: {},
      warnings,
      error: extracted.error,
      dispose,
    };
  }

  const pleditBytes = extracted.files.get('pledit.txt');
  const viscolorBytes = extracted.files.get('viscolor.txt');
  const pledit = parsePleditTxt(pleditBytes ? decoder.decode(pleditBytes) : undefined);
  const viscolor = parseViscolorTxt(viscolorBytes ? decoder.decode(viscolorBytes) : undefined);

  if (!pleditBytes) warnings.push('pledit.txt missing — using classic Winamp playlist colors.');
  if (!viscolorBytes) warnings.push('viscolor.txt missing — using classic Winamp visualizer palette.');

  const sprites: LoadedWszSkin['sprites'] = {};
  const bmpKeys: Array<[keyof LoadedWszSkin['sprites'], string, boolean]> = [
    ['main', 'main.bmp', true],
    ['cbuttons', 'cbuttons.bmp', true],
    ['eqmain', 'eqmain.bmp', false],
    ['shufrep', 'shufrep.bmp', false],
    ['posbar', 'posbar.bmp', false],
    ['volume', 'volume.bmp', false],
    ['titlebar', 'titlebar.bmp', false],
  ];

  for (const [prop, filename, warnIfMissing] of bmpKeys) {
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
      info,
    };
  }

  return {
    ok: true,
    name: skinName,
    pledit,
    viscolor,
    sprites,
    warnings,
    dispose,
  };
}

function formatWszClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Mounts an interactive Winamp `.wsz`-skinned deck into `.mp-slot.--theme-root`.
 * Every transport control is a real `<ds-trigger target={playerTarget} action="...">` element
 * rendered with exact `cbuttons.bmp` sprite slices (or crisp fallbacks for partial skins).
 */
export function mountWszSkinLayout(
  skin: LoadedWszSkin,
  ctx: PluginContext,
  container: HTMLElement,
  playerTarget: string,
  onExitSkin: () => void,
): PluginDisposer {
  container.innerHTML = '';

  const shell = document.createElement('div');
  shell.style.cssText = `display:inline-flex;flex-direction:column;gap:4px;font-family:${skin.pledit.font},sans-serif;user-select:none`;
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', `Winamp skin: ${skin.name}`);

  // Main 275x116 Winamp deck window
  const mainWin = document.createElement('div');
  mainWin.style.cssText =
    `position:relative;width:${WINAMP_MAIN_SIZE.width}px;height:${WINAMP_MAIN_SIZE.height}px;` +
    `border:1px solid #2b2f3d;overflow:hidden;image-rendering:pixelated;` +
    (skin.sprites.main
      ? `background:url("${skin.sprites.main.url}") top left no-repeat;`
      : 'background:linear-gradient(180deg,#2c3140,#181b24);');

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.textContent = '×';
  exitBtn.title = 'Exit .wsz skin (return to Minimal without stopping audio)';
  exitBtn.style.cssText =
    'position:absolute;top:2px;right:3px;width:14px;height:14px;line-height:10px;padding:0;border:0;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;cursor:pointer';
  exitBtn.addEventListener('click', onExitSkin);

  const clockEl = document.createElement('div');
  clockEl.style.cssText =
    `position:absolute;top:24px;left:38px;font-family:monospace;font-size:15px;font-weight:700;color:${skin.pledit.normal};text-shadow:0 0 4px rgba(0,0,0,0.8)`;

  const titleEl = document.createElement('div');
  titleEl.style.cssText =
    `position:absolute;top:25px;left:110px;width:154px;font-size:10px;color:${skin.pledit.normal};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;

  // Mini viscolor spectrum strip
  const visStrip = document.createElement('div');
  visStrip.style.cssText =
    `position:absolute;top:43px;left:24px;width:76px;height:16px;display:flex;align-items:flex-end;gap:1px;padding:1px;background:${skin.viscolor.background}`;
  for (let i = 0; i < 12; i += 1) {
    const bar = document.createElement('span');
    const col = skin.viscolor.spectrum[Math.min(skin.viscolor.spectrum.length - 1, i)] || '#00ff00';
    bar.style.cssText = `flex:1;height:${25 + ((i * 19) % 70)}%;background:${col}`;
    visStrip.append(bar);
  }

  // Transport controls mapped onto cbuttons.bmp sprites & driven by <ds-trigger>
  const cbuttonsRow = document.createElement('div');
  cbuttonsRow.style.cssText = 'position:absolute;left:16px;top:88px;display:flex;align-items:center;gap:0';

  for (const [key, spec] of Object.entries(WINAMP_CBUTTONS_SPRITES)) {
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
      btn.style.cssText =
        `width:${spec.normal.w}px;height:${spec.normal.h}px;padding:0;font-size:9px;background:#2f3547;color:#eef2ff;border:1px solid #535b73;cursor:pointer`;
    }
    trigger.append(btn);
    cbuttonsRow.append(trigger);
  }

  mainWin.append(exitBtn, clockEl, titleEl, visStrip, cbuttonsRow);
  shell.append(mainWin);

  // Optional eqmain.bmp skin window strip
  if (skin.sprites.eqmain) {
    const eqWin = document.createElement('div');
    eqWin.style.cssText =
      `width:${WINAMP_EQ_SIZE.width}px;height:${WINAMP_EQ_SIZE.height}px;` +
      `background:url("${skin.sprites.eqmain.url}") top left no-repeat;image-rendering:pixelated;border:1px solid #2b2f3d`;
    eqWin.setAttribute('aria-label', 'Winamp Equalizer Skin Graphic');
    shell.append(eqWin);
  }

  // Playlist window styled strictly with pledit.txt colors & font
  const plWin = document.createElement('div');
  plWin.style.cssText =
    `width:${WINAMP_MAIN_SIZE.width}px;max-height:110px;overflow-y:auto;padding:4px 6px;font-size:11px;` +
    `background:${skin.pledit.normalBg};color:${skin.pledit.normal};border:1px solid #2b2f3d;box-sizing:border-box`;
  shell.append(plWin);

  container.append(shell);

  const sync = (snap: PlayerSnapshot) => {
    clockEl.textContent = formatWszClock(snap.currentTime);
    titleEl.textContent = snap.currentTrack
      ? `${snap.currentTrack.artist ? `${snap.currentTrack.artist} - ` : ''}${snap.currentTrack.title}`
      : skin.name;

    plWin.innerHTML = '';
    for (let i = 0; i < snap.tracks.length; i += 1) {
      const tr = snap.tracks[i];
      const row = document.createElement('div');
      const isCur = i === snap.currentIndex;
      row.style.cssText =
        `padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
        `color:${isCur ? skin.pledit.current : skin.pledit.normal};` +
        `background:${isCur ? skin.pledit.selectedBg : 'transparent'}`;
      row.textContent = `${i + 1}. ${tr.artist ? `${tr.artist} - ` : ''}${tr.title}`;
      plWin.append(row);
    }
  };

  sync(ctx.getState());
  const unsubState = ctx.on('stateChange', snap => sync(snap));
  const unsubTime = ctx.on('timeUpdate', ({ currentTime }) => {
    clockEl.textContent = formatWszClock(currentTime);
  });
  const unsubPl = ctx.on('playlistChange', () => sync(ctx.getState()));

  return () => {
    unsubState();
    unsubTime();
    unsubPl();
    container.innerHTML = '';
  };
}
