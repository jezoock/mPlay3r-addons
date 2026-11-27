/**
 * Pure Winamp 2.x skin asset parsers (`pledit.txt`, `viscolor.txt`, and BMP header validator).
 */

export interface WszPleditConfig {
  normal: string;
  current: string;
  normalBg: string;
  selectedBg: string;
  mbBg: string;
  mbFg: string;
  font: string;
}

export interface WszViscolorPalette {
  background: string;
  gridDots: string;
  spectrum: string[];
  oscilloscope: string[];
  peak: string;
}

export interface BmpInfo {
  width: number;
  height: number;
  bitsPerPixel: number;
  byteLength: number;
}

export const DEFAULT_PLEDIT: Readonly<WszPleditConfig> = {
  normal: '#00ff00',
  current: '#ffffff',
  normalBg: '#000000',
  selectedBg: '#0000c6',
  mbBg: '#000000',
  mbFg: '#00ff00',
  font: 'Arial',
};

const DEFAULT_VISCOLOR_RGB: readonly string[] = [
  'rgb(0,0,0)',        // 0: background
  'rgb(24,33,41)',     // 1: grid dots
  'rgb(239,49,16)',    // 2..17: spectrum top -> bottom (16 colors)
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
  'rgb(255,255,255)',  // 18..22: oscilloscope (5 colors)
  'rgb(214,214,222)',
  'rgb(181,189,189)',
  'rgb(160,170,175)',
  'rgb(148,156,165)',
  'rgb(150,150,150)',  // 23: peak dots
];

/** Normalizes Winamp INI hex colors (`#00FF00`, `00FF00`, `#0F0`) or returns fallback. */
export function normalizeWszHex(raw: string | undefined, fallback: string): string {
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

/**
 * Parses a Winamp `pledit.txt` INI configuration into normalized colors and font family,
 * falling back cleanly to classic Winamp defaults for missing or malformed fields.
 */
export function parsePleditTxt(text: string | undefined): WszPleditConfig {
  const result: WszPleditConfig = { ...DEFAULT_PLEDIT };
  if (!text) return result;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('[') || line.startsWith(';') || line.startsWith('//')) {
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim().toLowerCase();
    // Strip inline INI comments after value if separated by whitespace + `;` or `//`
    const value = line
      .slice(eqIdx + 1)
      .replace(/\s+(?:;|\/\/).*$/, '')
      .trim()
      .replace(/^["']|["']$/g, '');

    switch (key) {
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

/**
 * Parses a Winamp `viscolor.txt` 24-line RGB color table (`r,g,b // comment`).
 * Tolerates partial files, comments, and out-of-range integers by clamping `[0, 255]` and filling defaults.
 */
export function parseViscolorTxt(text: string | undefined): WszViscolorPalette {
  const parsed: string[] = [...DEFAULT_VISCOLOR_RGB];
  if (text) {
    let rowIdx = 0;
    for (const rawLine of text.split(/\r?\n/)) {
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
    peak: parsed[23],
  };
}

/** Validates a Windows BMP header (`BM` signature + DIB dimensions) without external decoders. */
export function inspectBmpHeader(bytes: Uint8Array | undefined): BmpInfo | null {
  if (!bytes || bytes.byteLength < 26) {
    return null;
  }
  // Signature must be ASCII "BM" (0x42, 0x4D)
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dibSize = view.getUint32(14, true);
  if (dibSize < 12) {
    return null;
  }

  let width: number;
  let height: number;
  let bitsPerPixel: number;
  if (dibSize === 12) {
    // BITMAPCOREHEADER (12 bytes)
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
    byteLength: bytes.byteLength,
  };
}
