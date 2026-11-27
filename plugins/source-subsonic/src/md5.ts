/**
 * Minimal zero-dependency RFC 1321 MD5 implementation for Subsonic / OpenSubsonic / Navidrome
 * salted token authentication (`t = md5(password + salt)`).
 */

const MD5_SHIFTS: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K: readonly number[] = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
);

function md5Rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function md5WordToHexLE(word: number): string {
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}

/** Computes lowercase 32-character RFC 1321 MD5 hex digest for a UTF-8 string. */
export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
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
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let j = 0; j < 16; j += 1) {
      m[j] = view.getUint32(offset + j * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const nextD = c;
      const nextC = b;
      const sum = (a + f + MD5_K[i] + m[g]) >>> 0;
      const nextB = (b + md5Rotl(sum, MD5_SHIFTS[i])) >>> 0;
      a = d;
      b = nextB;
      c = nextC;
      d = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return md5WordToHexLE(a0) + md5WordToHexLE(b0) + md5WordToHexLE(c0) + md5WordToHexLE(d0);
}
