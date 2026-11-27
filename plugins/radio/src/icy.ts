export interface IcyMetadata {
  streamTitle?: string;
  artist?: string;
  title?: string;
  streamUrl?: string;
}

/**
 * Parses an Icecast / SHOUTcast ICY metadata string such as:
 * `StreamTitle='Daft Punk - Digital Love';StreamUrl='https://...';`
 */
export function parseIcyMetadata(raw: string): IcyMetadata {
  const cleaned = raw.split('\u0000')[0].trim();
  if (!cleaned) {
    return {};
  }

  const titleMatch = cleaned.match(/StreamTitle='([^']*)'/i);
  const urlMatch = cleaned.match(/StreamUrl='([^']*)'/i);
  const streamTitle = titleMatch?.[1]?.trim() || undefined;
  const streamUrl = urlMatch?.[1]?.trim() || undefined;

  if (!streamTitle) {
    return streamUrl ? { streamUrl } : {};
  }

  const splitMatch = streamTitle.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (splitMatch) {
    return {
      streamTitle,
      artist: splitMatch[1].trim(),
      title: splitMatch[2].trim(),
      ...(streamUrl ? { streamUrl } : {}),
    };
  }

  return {
    streamTitle,
    title: streamTitle,
    ...(streamUrl ? { streamUrl } : {}),
  };
}

/**
 * Extracts an ICY metadata block from a raw stream chunk given `icy-metaint` byte interval.
 * Format: `[metaInt audio bytes][1 length byte * 16][metadata bytes]`.
 */
export function extractIcyFromChunk(chunk: Uint8Array, metaInt: number): IcyMetadata | null {
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

/** True when a radio stream URL points to an HLS playlist (`.m3u8`). */
export function isHlsStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\.m3u8$/i.test(parsed.pathname) || parsed.pathname.toLowerCase().includes('/hls/');
  } catch {
    return /\.m3u8(?:\?|$)/i.test(url);
  }
}

export interface HlsVariant {
  url: string;
  bandwidth: number;
  codecs?: string;
}

/**
 * Parses an HLS `#EXT-X-STREAM-INF` master playlist and returns audio/stream variants
 * sorted from highest to lowest bandwidth with resolved absolute URLs.
 */
export function parseHlsMasterPlaylist(content: string, baseUrl: string): HlsVariant[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const variants: HlsVariant[] = [];
  let pendingBandwidth = 0;
  let pendingCodecs: string | undefined;
  let expectingUri = false;

  for (const rawLine of lines) {
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
          ...(pendingCodecs ? { codecs: pendingCodecs } : {}),
        });
      } catch {
        // Skip malformed variant URI.
      }
      expectingUri = false;
      pendingBandwidth = 0;
      pendingCodecs = undefined;
    }
  }

  return variants.sort((a, b) => b.bandwidth - a.bandwidth);
}
