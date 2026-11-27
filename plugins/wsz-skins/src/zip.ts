/**
 * Zero-dependency ZIP / `.wsz` archive extractor supporting Stored (0) and Deflate (8)
 * entries using native Web `DecompressionStream('deflate-raw')`.
 * Safely handles nested folders, path-traversal guards, size limits, and partial/corrupted archives.
 */

export interface WszZipExtraction {
  ok: boolean;
  files: Map<string, Uint8Array>;
  warnings: string[];
  error?: string;
}

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;
const MAX_WSZ_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;

function readU16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is unavailable for deflated .wsz entries.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  void writer.write(copy).then(() => writer.close());

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
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
  for (const chunk of chunks) {
    merged.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return merged;
}

function normalizeWszEntryName(rawName: string): string | null {
  const normalized = rawName.replace(/\\/g, '/').trim();
  if (!normalized || normalized.endsWith('/') || normalized.includes('\0')) {
    return null;
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(p => p === '..')) {
    return null;
  }
  const basename = parts[parts.length - 1];
  return basename ? basename.toLowerCase() : null;
}

/**
 * Extracts a Winamp `.wsz` (ZIP) archive into a case-insensitive basename map (`main.bmp`, `pledit.txt`, etc.).
 * Never throws on malformed or truncated archives — returns structured `{ ok, files, warnings, error }`.
 */
export async function extractWszArchive(bytes: Uint8Array): Promise<WszZipExtraction> {
  const files = new Map<string, Uint8Array>();
  const warnings: string[] = [];

  if (!bytes || bytes.byteLength < 22) {
    return { ok: false, files, warnings, error: 'Archive is too small to be a valid .wsz (ZIP) file.' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Locate End of Central Directory (EOCD) scanning backwards up to 65 KB comment window.
  const minPos = Math.max(0, bytes.byteLength - 65557);
  let eocdOffset = -1;
  for (let i = bytes.byteLength - 22; i >= minPos; i -= 1) {
    if (readU32LE(view, i) === ZIP_EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    return { ok: false, files, warnings, error: 'Invalid .wsz archive: ZIP End-of-Central-Directory signature missing.' };
  }

  const totalEntries = readU16LE(view, eocdOffset + 10);
  const cdSize = readU32LE(view, eocdOffset + 12);
  const cdOffset = readU32LE(view, eocdOffset + 16);

  if (cdOffset + cdSize > bytes.byteLength) {
    return { ok: false, files, warnings, error: 'Corrupted .wsz archive: Central Directory extends past EOF.' };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let cursor = cdOffset;
  let totalExtractedBytes = 0;

  for (let idx = 0; idx < totalEntries; idx += 1) {
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
      let content: Uint8Array;
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
      warnings.push(
        `Skipped "${cleanName}": ${err instanceof Error ? err.message : 'decompression failed'}.`,
      );
    }
  }

  if (files.size === 0) {
    return {
      ok: false,
      files,
      warnings,
      error: 'No readable files could be extracted from the .wsz archive.',
    };
  }

  return { ok: true, files, warnings };
}
