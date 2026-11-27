/**
 * Zero-dependency synchronized `.lrc` lyrics parser with multi-timestamp support,
 * `[offset:...]` handling, enhanced inline word-tag stripping, and O(log n) active-line lookup.
 */

export interface LrcLine {
  timeSeconds: number;
  text: string;
}

export interface ParsedLrc {
  metadata: Record<string, string>;
  offsetSeconds: number;
  lines: LrcLine[];
  plainText: string;
}

export interface ActiveLrcWindow {
  index: number;
  prev: LrcLine | null;
  active: LrcLine | null;
  next: LrcLine | null;
}

const LRC_TIMESTAMP_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_META_TAG_RE = /^\[([a-zA-Z]{2,12}):([^\]]*)\]$/;

/** Parses a single LRC timestamp body (`mm:ss`, `mm:ss.xx`, `mm:ss.xxx`, `mm:ss:xx`) into seconds. */
export function parseLrcTimestamp(minsStr: string, secsStr: string, fracStr?: string): number | null {
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

/**
 * Parses an `.lrc` string into sorted timed lines + metadata tags.
 * Supports multiple timestamps per line (e.g. `[00:12.50][01:04.20]Chorus`) and `[offset:ms]`.
 */
export function parseLrc(raw: string): ParsedLrc {
  const metadata: Record<string, string> = {};
  let offsetSeconds = 0;
  const rawEntries: LrcLine[] = [];
  const plainLines: string[] = [];

  for (const rawLine of (raw || '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Collect all leading/inline [mm:ss.xx] timestamps on the line.
    const timestamps: number[] = [];
    LRC_TIMESTAMP_RE.lastIndex = 0;
    let match = LRC_TIMESTAMP_RE.exec(trimmed);
    while (match !== null) {
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

    // Remove [mm:ss.xx] tags and enhanced-LRC inline word timing tags (<mm:ss.xx>).
    const text = trimmed
      .replace(LRC_TIMESTAMP_RE, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (text) {
      plainLines.push(text);
    }
    for (const ts of timestamps) {
      rawEntries.push({ timeSeconds: ts, text });
    }
  }

  // Apply `[offset:ms]` (positive offset shifts lyrics earlier per LRC specification).
  const lines = rawEntries
    .map(entry => ({
      timeSeconds: Math.max(0, Math.round((entry.timeSeconds - offsetSeconds) * 1000) / 1000),
      text: entry.text,
    }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);

  return {
    metadata,
    offsetSeconds,
    lines,
    plainText: plainLines.join('\n'),
  };
}

/**
 * Binary search returning the index of the active lyric line at `currentTimeSeconds`,
 * or `-1` when playback is before the first timestamp or `lines` is empty.
 */
export function findActiveLrcLineIndex(lines: readonly LrcLine[], currentTimeSeconds: number): number {
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
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeSeconds <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Returns previous, active, and upcoming lyric lines around `currentTimeSeconds`. */
export function getActiveLrcWindow(lines: readonly LrcLine[], currentTimeSeconds: number): ActiveLrcWindow {
  const index = findActiveLrcLineIndex(lines, currentTimeSeconds);
  if (index < 0) {
    return {
      index: -1,
      prev: null,
      active: null,
      next: lines[0] ?? null,
    };
  }
  return {
    index,
    prev: index > 0 ? lines[index - 1] : null,
    active: lines[index] ?? null,
    next: index + 1 < lines.length ? lines[index + 1] : null,
  };
}
