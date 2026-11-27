/**
 * Zero-dependency ISO/IEC 18004 QR Code encoder (Byte mode, ECC Level L, Versions 1-6, up to 134 UTF-8 bytes)
 * with single-path SVG rendering for instant LAN phone scanning.
 */

export interface QrMatrix {
  version: number;
  size: number;
  modules: boolean[][];
}

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecPerBlock: number;
  blocks: number;
  alignCoord: number | null;
}

// ISO/IEC 18004 ECC Level L specifications for Versions 1..6 (Byte mode capacity: 17..134 bytes)
const QR_VERSION_SPECS: readonly QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecPerBlock: 7, blocks: 1, alignCoord: null },
  { version: 2, size: 25, dataCodewords: 34, ecPerBlock: 10, blocks: 1, alignCoord: 18 },
  { version: 3, size: 29, dataCodewords: 55, ecPerBlock: 15, blocks: 1, alignCoord: 22 },
  { version: 4, size: 33, dataCodewords: 80, ecPerBlock: 20, blocks: 1, alignCoord: 26 },
  { version: 5, size: 37, dataCodewords: 108, ecPerBlock: 26, blocks: 1, alignCoord: 30 },
  { version: 6, size: 41, dataCodewords: 136, ecPerBlock: 18, blocks: 2, alignCoord: 34 },
];

// Precomputed BCH(15,5) + XOR 0x5412 format strings for ECC Level L (bits 01) and masks 0..7
const QR_FORMAT_BITS_L: readonly number[] = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

function qrGfMultiply(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  for (let i = 0; i < 8; i += 1) {
    if ((y & 1) !== 0) result ^= x;
    const high = (x & 0x80) !== 0;
    x = (x << 1) & 0xff;
    if (high) x ^= 0x1d;
    y >>= 1;
  }
  return result;
}

function qrReedSolomonGenerator(degree: number): number[] {
  let poly = [1];
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= qrGfMultiply(poly[j], root);
    }
    poly = next;
    root = qrGfMultiply(root, 2);
  }
  return poly;
}

function qrComputeEcBytes(data: number[], ecCount: number): number[] {
  const gen = qrReedSolomonGenerator(ecCount);
  const rem = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < ecCount; i += 1) {
      rem[i] ^= qrGfMultiply(gen[i + 1], factor);
    }
  }
  return rem;
}

function qrMaskCondition(maskId: number, row: number, col: number): boolean {
  switch (maskId) {
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
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function qrPenaltyScore(modules: boolean[][]): number {
  const n = modules.length;
  let penalty = 0;
  let darkCount = 0;

  // Rule 1: adjacent modules of same color in row/col
  for (let r = 0; r < n; r += 1) {
    let runColor = modules[r][0];
    let runLen = 1;
    if (runColor) darkCount += 1;
    for (let c = 1; c < n; c += 1) {
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
  for (let c = 0; c < n; c += 1) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < n; r += 1) {
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

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const val = modules[r][c];
      if (val === modules[r][c + 1] && val === modules[r + 1][c] && val === modules[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 4: balance of dark vs light modules
  const ratio = Math.abs(darkCount * 20 - n * n * 10);
  penalty += Math.floor(ratio / (n * n)) * 10;
  return penalty;
}

function qrApplyFormatBits(modules: boolean[][], maskId: number): void {
  const n = modules.length;
  const bits = QR_FORMAT_BITS_L[maskId];
  for (let i = 0; i < 15; i += 1) {
    const bit = ((bits >> i) & 1) === 1;
    // First copy around top-left finder
    if (i < 6) modules[i][8] = bit;
    else if (i < 8) modules[i + 1][8] = bit;
    else modules[n - 15 + i][8] = bit;

    // Second copy along top-right & bottom-left
    if (i < 8) modules[8][n - 1 - i] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;
  }
}

/** Encodes a UTF-8 string (up to 134 bytes) into a standard scannable QR Code matrix. */
export function encodeQrMatrix(text: string): QrMatrix {
  const payload = new TextEncoder().encode(text);
  const spec = QR_VERSION_SPECS.find(s => payload.length + 2 <= s.dataCodewords);
  if (!spec) {
    throw new Error(`QR payload too long (${payload.length} bytes; max 134 bytes).`);
  }

  // Build bit stream: 0100 (Byte mode) + 8-bit length + UTF-8 bytes + terminator + pad bytes
  const bits: number[] = [];
  const pushBits = (val: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) {
      bits.push((val >> i) & 1);
    }
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const byte of payload) {
    pushBits(byte, 8);
  }
  const capacityBits = spec.dataCodewords * 8;
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b];
    dataCodewords.push(byte);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < spec.dataCodewords) {
    dataCodewords.push(padBytes[padIdx % 2]);
    padIdx += 1;
  }

  // Split into RS blocks, compute EC codewords, and interleave
  const blockSize = spec.dataCodewords / spec.blocks;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < spec.blocks; b += 1) {
    const slice = dataCodewords.slice(b * blockSize, (b + 1) * blockSize);
    dataBlocks.push(slice);
    ecBlocks.push(qrComputeEcBytes(slice, spec.ecPerBlock));
  }

  const finalBytes: number[] = [];
  for (let i = 0; i < blockSize; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) finalBytes.push(dataBlocks[b][i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) finalBytes.push(ecBlocks[b][i]);
  }

  // Initialize base matrix & function-module mask
  const n = spec.size;
  const base: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const isFunction: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));

  const setFn = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      base[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // Finder patterns + white separators
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        setFn(top + dr, left + dc, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i += 1) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Alignment pattern for Versions 2..6
  if (spec.alignCoord !== null) {
    const center = spec.alignCoord;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        setFn(center + dr, center + dc, dist !== 1);
      }
    }
  }

  // Reserve format info areas & fixed dark module
  for (let i = 0; i < 9; i += 1) {
    if (!isFunction[8][i]) setFn(8, i, false);
    if (!isFunction[i][8]) setFn(i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    setFn(8, n - 1 - i, false);
    setFn(n - 1 - i, 8, false);
  }
  setFn(4 * spec.version + 9, 8, true);

  // Place data bits in zig-zag columns right-to-left
  const finalBits: boolean[] = [];
  for (const byte of finalBytes) {
    for (let b = 7; b >= 0; b -= 1) {
      finalBits.push(((byte >> b) & 1) === 1);
    }
  }
  let bitIndex = 0;
  let upward = true;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < n; step += 1) {
      const row = upward ? n - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const c = col - offset;
        if (!isFunction[row][c]) {
          base[row][c] = bitIndex < finalBits.length ? finalBits[bitIndex] : false;
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
  }

  // Select optimal mask (0..7) by penalty score
  let bestModules = base;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let maskId = 0; maskId < 8; maskId += 1) {
    const candidate = base.map((row, r) =>
      row.map((val, c) => (isFunction[r][c] ? val : qrMaskCondition(maskId, r, c) ? !val : val)),
    );
    qrApplyFormatBits(candidate, maskId);
    const score = qrPenaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestModules = candidate;
    }
  }

  return { version: spec.version, size: n, modules: bestModules };
}

/** Renders a crisp single-path SVG QR code string with a 4-module quiet zone. */
export function renderQrCodeSvg(
  text: string,
  options: { pixelSize?: number; fg?: string; bg?: string } = {},
): string {
  const { size, modules } = encodeQrMatrix(text);
  const quiet = 4;
  const viewSize = size + quiet * 2;
  const px = options.pixelSize ?? 168;
  const fg = options.fg ?? '#111827';
  const bg = options.bg ?? '#ffffff';

  const parts: string[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) {
        parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-label="LAN Share QR Code" shape-rendering="crispEdges">` +
    `<rect width="${viewSize}" height="${viewSize}" fill="${bg}"/>` +
    `<path d="${parts.join('')}" fill="${fg}"/>` +
    `</svg>`
  );
}
