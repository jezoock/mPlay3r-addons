import type { PlayerSnapshot, PluginContext, PluginDisposer, Track } from '../../../sdk/types';

export type PrismGlassViewMode = 'player' | 'library' | 'dual';
export type PrismCollectionFilter = 'all' | 'chill' | 'focus';

export const PRISM_GLASS_THEME_ID = 'prism-glass';
export const PRISM_GLASS_THEME_KEY = 'mplay3r.theme-prism-glass:prism-glass';

/** Zero-dependency SVG electric-blue & violet neon-mist artwork matching the squircle hero cover. */
export const PRISM_HERO_ART_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="pg-sky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b2cf5"/>
      <stop offset="48%" stop-color="#2b45e6"/>
      <stop offset="100%" stop-color="#0582f5"/>
    </linearGradient>
    <radialGradient id="pg-mist-l" cx="24%" cy="56%" r="58%">
      <stop offset="0%" stop-color="#f472b6" stop-opacity="0.72"/>
      <stop offset="55%" stop-color="#7c3aed" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pg-mist-r" cx="80%" cy="46%" r="54%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.88"/>
      <stop offset="58%" stop-color="#0284c7" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pg-sil" x1="20%" y1="10%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#312e81"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#pg-sky)"/>
  <circle cx="48" cy="112" r="95" fill="url(#pg-mist-l)"/>
  <circle cx="162" cy="88" r="92" fill="url(#pg-mist-r)"/>
  <!-- Atmospheric misty figure silhouette & luminous stage beam -->
  <path d="M52 200 C56 146, 70 112, 92 94 C86 80, 90 60, 106 58 C122 56, 128 74, 122 92 C142 108, 154 146, 158 200 Z" fill="url(#pg-sil)" opacity="0.88"/>
  <path d="M90 100 L38 42 C34 38, 42 30, 48 36 L100 88 Z" fill="#c084fc" opacity="0.65"/>
  <path d="M116 96 C140 102, 156 138, 152 200 L114 200 Z" fill="#7dd3fc" opacity="0.48"/>
  <ellipse cx="146" cy="126" rx="44" ry="26" fill="#bae6fd" opacity="0.28"/>
  <ellipse cx="64" cy="74" rx="46" ry="28" fill="#f9a8d4" opacity="0.24"/>
</svg>`;

const COLL_ART_ALL = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="pg-c1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f9a8d4"/><stop offset="55%" stop-color="#f472b6"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient></defs>
  <rect width="96" height="96" fill="url(#pg-c1)"/>
  <circle cx="48" cy="39" r="17" fill="#fde68a" opacity="0.92"/>
  <path d="M24 88 C26 64, 70 64, 72 88 Z" fill="#38bdf8" opacity="0.85"/>
  <path d="M30 38 C30 22, 66 22, 66 38" fill="none" stroke="#38bdf8" stroke-width="4.5" stroke-linecap="round"/>
</svg>`;

const COLL_ART_CHILL = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="pg-c2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e293b"/><stop offset="60%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>
  <rect width="96" height="96" fill="url(#pg-c2)"/>
  <rect x="46" y="42" width="38" height="24" rx="4" fill="#94a3b8" opacity="0.5"/>
  <rect x="50" y="45" width="30" height="17" rx="2" fill="#e2e8f0" opacity="0.85"/>
  <circle cx="28" cy="40" r="14" fill="#fbbf24" opacity="0.72"/>
  <path d="M12 88 C16 62, 44 62, 48 88 Z" fill="#475569"/>
</svg>`;

const COLL_ART_FOCUS = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="pg-c3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#60a5fa"/><stop offset="50%" stop-color="#818cf8"/><stop offset="100%" stop-color="#f472b6"/></linearGradient></defs>
  <rect width="96" height="96" fill="url(#pg-c3)"/>
  <circle cx="48" cy="48" r="24" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/>
  <polygon points="43,38 61,48 43,58" fill="#ffffff" opacity="0.95"/>
</svg>`;

export const PRISM_GLASS_CSS = `
.mp-pg-stage {
  --pg-coral-1: #ff563a;
  --pg-coral-2: #ef3e29;
  --pg-coral-3: #d52719;
  --pg-ink: #2b3042;
  --pg-white: #ffffff;
  --pg-sub: rgba(255, 255, 255, 0.82);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--pg-white);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  user-select: none;
  padding: 6px;
}
.mp-pg-card {
  position: relative;
  width: 318px;
  max-width: 100%;
  min-height: 552px;
  border-radius: 34px;
  padding: 20px 22px 22px 22px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1.5px solid rgba(255, 255, 255, 0.58);
  background:
    radial-gradient(circle at 84% 16%, rgba(108, 114, 246, 0.62) 0%, rgba(108, 114, 246, 0) 48%),
    radial-gradient(circle at 18% 72%, rgba(232, 134, 206, 0.56) 0%, rgba(232, 134, 206, 0) 52%),
    radial-gradient(circle at 52% 46%, rgba(88, 92, 232, 0.45) 0%, rgba(145, 148, 224, 0.25) 60%),
    linear-gradient(155deg, rgba(188, 192, 242, 0.88) 0%, rgba(148, 152, 228, 0.84) 52%, rgba(184, 150, 222, 0.88) 100%);
  backdrop-filter: blur(22px) saturate(145%);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
  box-shadow:
    0 22px 46px rgba(42, 36, 108, 0.36),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(255, 255, 255, 0.28);
}
.mp-pg-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.04) 44%, rgba(255, 255, 255, 0.14) 100%);
}
.mp-desktop-frameless .mp-pg-stage {
  padding: 0;
}
.mp-desktop-frameless .mp-pg-card {
  box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.28);
}
.mp-pg-stage[data-pg-view="player"] .mp-pg-card.--library {
  display: none;
}
.mp-pg-stage[data-pg-view="library"] .mp-pg-card.--player {
  display: none;
}
.mp-pg-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 24px;
  cursor: grab;
}
.mp-pg-topbar:active {
  cursor: grabbing;
}
.mp-pg-caption {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #ffffff;
  text-shadow: 0 1px 6px rgba(52, 46, 128, 0.28);
}
/* Signature double-ringed frosted glass circular buttons */
.mp-pg-ring-btn,
.mp-pg-card ds-trigger.--pg-ring button {
  width: 44px;
  height: 44px;
  padding: 4px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.68);
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 16px rgba(68, 60, 148, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.65);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 110ms ease, background 140ms ease;
}
.mp-pg-ring-btn:hover,
.mp-pg-card ds-trigger.--pg-ring button:hover {
  background: rgba(255, 255, 255, 0.3);
}
.mp-pg-ring-btn:active,
.mp-pg-card ds-trigger.--pg-ring button:active {
  transform: scale(0.95);
}
.mp-pg-ring-core {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffffff 0%, #eef1fb 100%);
  color: var(--pg-ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(45, 42, 92, 0.16);
}
.mp-pg-ring-core.--coral {
  color: var(--pg-coral-2);
}
/* Squircle-in-Squircle Frosted Glass Artwork Frame */
.mp-pg-art-wrap {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  margin: 4px 0 24px 0;
}
.mp-pg-art-frame {
  width: 196px;
  height: 196px;
  border-radius: 40px;
  padding: 16px;
  border: 1.5px solid rgba(255, 255, 255, 0.56);
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.08) 100%);
  box-shadow: 0 16px 32px rgba(48, 40, 128, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.65);
  box-sizing: border-box;
}
.mp-pg-art-inner {
  width: 100%;
  height: 100%;
  border-radius: 26px;
  overflow: hidden;
  box-shadow: 0 10px 22px rgba(26, 20, 88, 0.34);
}
.mp-pg-art-inner svg {
  display: block;
  width: 100%;
  height: 100%;
}
.mp-pg-meta {
  position: relative;
  z-index: 2;
  text-align: center;
  margin-bottom: 22px;
}
.mp-pg-title {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: #ffffff;
  text-shadow: 0 2px 10px rgba(48, 42, 120, 0.26);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-pg-artist {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pg-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Frosted Track + Coral Bar + White/Coral-Dot Thumb + Remaining Time (-3:06) */
.mp-pg-scrub {
  position: relative;
  z-index: 2;
  margin-bottom: 22px;
}
.mp-pg-track-wrap {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}
.mp-pg-track-bg {
  position: relative;
  width: 100%;
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.72);
  overflow: hidden;
}
.mp-pg-track-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--pg-coral-1), var(--pg-coral-2));
}
.mp-pg-thumb {
  position: absolute;
  top: 50%;
  left: 0%;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #ffffff;
  border: 1.5px solid rgba(255, 255, 255, 0.92);
  box-shadow: 0 3px 10px rgba(46, 38, 118, 0.35);
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-pg-thumb::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pg-coral-2);
}
.mp-pg-seek-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.mp-pg-remaining {
  margin-top: 6px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.88);
}
/* Transport Trio */
.mp-pg-transport {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-bottom: 18px;
}
.mp-pg-card ds-trigger.--pg-nav button {
  width: 54px;
  height: 54px;
  padding: 5px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.68);
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 20px rgba(54, 46, 130, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.68);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 110ms ease;
}
.mp-pg-card ds-trigger.--pg-nav button:active {
  transform: scale(0.95);
}
.mp-pg-card ds-trigger.--pg-play button {
  width: 72px;
  height: 72px;
  padding: 7px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 26px rgba(52, 40, 128, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 110ms ease, filter 140ms ease;
}
.mp-pg-card ds-trigger.--pg-play button:hover {
  filter: brightness(1.06);
}
.mp-pg-card ds-trigger.--pg-play button:active {
  transform: scale(0.95);
}
.mp-pg-play-core {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--pg-coral-1) 0%, var(--pg-coral-2) 60%, var(--pg-coral-3) 100%);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(239, 62, 41, 0.45);
}
.mp-pg-util {
  position: relative;
  z-index: 2;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.26);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.mp-pg-vol {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
}
.mp-pg-vol input[type="range"] {
  width: 100%;
  accent-color: var(--pg-coral-2);
  cursor: pointer;
}
.mp-pg-chip,
.mp-pg-util ds-trigger.--pg-chip button {
  border: 1px solid rgba(255, 255, 255, 0.56);
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  border-radius: 999px;
  padding: 4px 9px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}
.mp-pg-chip:hover,
.mp-pg-util ds-trigger.--pg-chip button:hover {
  background: rgba(255, 255, 255, 0.36);
}
/* ==================== RIGHT CARD: COLLECTIONS & RECOMMENDED ==================== */
.mp-pg-search-row {
  position: relative;
  z-index: 2;
  margin: -10px 0 12px 0;
  display: none;
}
.mp-pg-search-row.--open {
  display: block;
}
.mp-pg-search-input {
  width: 100%;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.24);
  color: #ffffff;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.mp-pg-search-input::placeholder {
  color: rgba(255, 255, 255, 0.72);
}
.mp-pg-section-lbl {
  position: relative;
  z-index: 2;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  margin-bottom: 10px;
}
.mp-pg-collections {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.mp-pg-coll {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  color: #ffffff;
  cursor: pointer;
}
.mp-pg-coll-frame {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 22px;
  padding: 6px;
  border: 1.5px solid rgba(255, 255, 255, 0.56);
  background: rgba(255, 255, 255, 0.16);
  box-sizing: border-box;
  margin-bottom: 6px;
  transition: border-color 140ms ease, transform 120ms ease;
}
.mp-pg-coll.--active .mp-pg-coll-frame {
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 8px 18px rgba(56, 48, 138, 0.28);
}
.mp-pg-coll:hover .mp-pg-coll-frame {
  transform: translateY(-1px);
}
.mp-pg-coll-art {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
}
.mp-pg-coll-art svg {
  display: block;
  width: 100%;
  height: 100%;
}
.mp-pg-coll-name {
  font-size: 11.5px;
  font-weight: 700;
  color: #ffffff;
}
.mp-pg-coll-count {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.78);
}
.mp-pg-list {
  position: relative;
  z-index: 2;
  flex: 1;
  max-height: 224px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 64px;
}
.mp-pg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.24);
  cursor: pointer;
}
.mp-pg-row:last-child {
  border-bottom: none;
}
.mp-pg-row-meta {
  min-width: 0;
  flex: 1;
}
.mp-pg-row-title {
  font-size: 13px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-pg-row-sub {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.78);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-pg-row-play {
  width: 38px;
  height: 38px;
  padding: 4px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mp-pg-row.--active .mp-pg-row-play {
  border-color: #ffffff;
  background: rgba(239, 62, 41, 0.26);
}
/* Floating Frosted Mini-Player Docked at Bottom of Right Card */
.mp-pg-mini {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 4;
  border-radius: 26px;
  padding: 8px 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.68);
  background: linear-gradient(135deg, rgba(232, 234, 255, 0.78) 0%, rgba(206, 198, 248, 0.72) 100%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 10px 26px rgba(42, 34, 112, 0.28);
  display: flex;
  align-items: center;
  gap: 10px;
}
.mp-pg-mini ds-trigger.--pg-mini-play button {
  width: 40px;
  height: 40px;
  padding: 4px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.35);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.mp-pg-mini-meta {
  min-width: 0;
  flex: 1;
}
.mp-pg-mini-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #272643;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-pg-mini-sub {
  font-size: 10.5px;
  color: #5b5978;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-pg-mini-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mp-pg-mini ds-trigger.--pg-mini-nav button {
  width: 34px;
  height: 34px;
  padding: 3px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.24);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
`;

/** Formats remaining track time in negative `-m:ss` style matching the reference scrubber (`-3:06`). */
export function formatGlassRemaining(currentTime: number, duration: number): string {
  const safeDur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCur = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  const rem = Math.max(0, Math.ceil(safeDur - safeCur));
  const mins = Math.floor(rem / 60);
  const secs = rem % 60;
  return `-${mins}:${String(secs).padStart(2, '0')}`;
}

/** Clamps playback progress ratio into `[0..100]` percent for the frosted coral scrubber. */
export function computeGlassProgress(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (currentTime / duration) * 100));
}

/** Filters tracks by collection bucket and free-text query for the Collections & Recommended view. */
export function filterPrismTracks(
  tracks: readonly Track[],
  collection: PrismCollectionFilter,
  query: string,
): Array<{ track: Track; index: number }> {
  const normalized = query.trim().toLowerCase();
  const out: Array<{ track: Track; index: number }> = [];
  tracks.forEach((track, index) => {
    if (collection === 'chill' && index % 2 !== 0) {
      return;
    }
    if (collection === 'focus' && index % 2 !== 1) {
      return;
    }
    if (normalized) {
      const hay = `${track.title} ${track.artist || ''} ${track.album || ''}`.toLowerCase();
      if (!hay.includes(normalized)) {
        return;
      }
    }
    out.push({ track, index });
  });
  return out;
}

function pgSvg(pathMarkup: string, size = 15): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${pathMarkup}</svg>`;
}

const PG_ICON_BACK = pgSvg('<path d="M19 11H7.83l4.88-4.88-1.42-1.42L4 12l7.29 7.29 1.42-1.41L7.83 13H19v-2z"/>', 14);
const PG_ICON_DOTS = pgSvg('<circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/>', 14);
const PG_ICON_SEARCH = pgSvg('<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>', 14);
const PG_ICON_GRID = pgSvg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>', 13);
const PG_ICON_PREV = pgSvg('<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>', 16);
const PG_ICON_NEXT = pgSvg('<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>', 16);
const PG_ICON_PLAY = pgSvg('<path d="M8 5v14l11-7z"/>', 20);
const PG_ICON_PAUSE = pgSvg('<path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z"/>', 20);
const PG_ICON_PLAY_SM = pgSvg('<path d="M8 5v14l11-7z"/>', 12);
const PG_ICON_PAUSE_SM = pgSvg('<path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z"/>', 12);

function pgTrigger(
  target: string,
  action: string,
  label: string,
  cls: string,
  content: string,
  isHtml = false,
): HTMLElement {
  const trig = document.createElement('ds-trigger');
  trig.className = cls;
  trig.setAttribute('target', target);
  trig.setAttribute('action', action);
  trig.setAttribute('label', label);
  const btn = document.createElement('button');
  btn.type = 'button';
  if (isHtml) {
    btn.innerHTML = content;
  } else {
    btn.textContent = content;
  }
  trig.append(btn);
  return trig;
}

function pgIsDesktop(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function applyPrismGlassTheme(playerTarget: string, themeKey: string | null): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(playerTarget) as
    | (HTMLElement & { getPluginHost?: () => Promise<{ setActiveTheme(key: string | null): void }> })
    | null;
  if (el && typeof el.getPluginHost === 'function') {
    void el.getPluginHost().then(host => host.setActiveTheme(themeKey));
  }
}

export interface PrismGlassMountOptions {
  initialView: PrismGlassViewMode;
  onViewChange: (view: PrismGlassViewMode) => void;
}

export function mountPrismGlassLayout(
  ctx: PluginContext,
  container: HTMLElement,
  playerTarget: string,
  options: PrismGlassMountOptions,
): PluginDisposer {
  let viewMode: PrismGlassViewMode = options.initialView;
  let activeCollection: PrismCollectionFilter = 'all';
  let searchQuery = '';
  let searchOpen = false;

  const stage = document.createElement('div');
  stage.className = 'mp-pg-stage';
  stage.dataset.pgView = viewMode;

  const setView = (next: PrismGlassViewMode) => {
    viewMode = next;
    stage.dataset.pgView = next;
    dualBtn.textContent = next === 'dual' ? '1 Card' : '2 Cards';
    options.onViewChange(next);
  };

  // ==================== CARD 1: LISTEN NOW ====================
  const playerCard = document.createElement('div');
  playerCard.className = 'mp-pg-card --player';

  const topBar = document.createElement('div');
  topBar.className = 'mp-pg-topbar';
  topBar.setAttribute('data-tauri-drag-region', '');

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'mp-pg-ring-btn';
  backBtn.setAttribute('aria-label', 'Return to Minimal theme');
  backBtn.title = 'Return to Minimal UI';
  backBtn.innerHTML = `<span class="mp-pg-ring-core">${PG_ICON_BACK}</span>`;
  backBtn.addEventListener('click', () => applyPrismGlassTheme(playerTarget, null));

  const caption = document.createElement('span');
  caption.className = 'mp-pg-caption';
  caption.textContent = 'Listen now';
  caption.setAttribute('data-tauri-drag-region', '');

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'mp-pg-ring-btn';
  moreBtn.setAttribute('aria-label', 'Open Collections and Tracklist');
  moreBtn.title = 'Collections & Tracklist';
  moreBtn.innerHTML = `<span class="mp-pg-ring-core">${PG_ICON_DOTS}</span>`;
  moreBtn.addEventListener('click', () => setView(viewMode === 'library' ? 'player' : 'library'));

  topBar.append(backBtn, caption, moreBtn);

  // Squircle-in-Squircle Artwork Frame
  const artWrap = document.createElement('div');
  artWrap.className = 'mp-pg-art-wrap';
  const artFrame = document.createElement('div');
  artFrame.className = 'mp-pg-art-frame';
  const artInner = document.createElement('div');
  artInner.className = 'mp-pg-art-inner';
  artInner.innerHTML = PRISM_HERO_ART_SVG;
  artFrame.append(artInner);
  artWrap.append(artFrame);

  // Title & Artist
  const meta = document.createElement('div');
  meta.className = 'mp-pg-meta';
  const titleEl = document.createElement('div');
  titleEl.className = 'mp-pg-title';
  const artistEl = document.createElement('div');
  artistEl.className = 'mp-pg-artist';
  meta.append(titleEl, artistEl);

  // Frosted Track + Coral Fill + White/Coral-Dot Thumb + Remaining (-3:06)
  const scrub = document.createElement('div');
  scrub.className = 'mp-pg-scrub';
  const trackWrap = document.createElement('div');
  trackWrap.className = 'mp-pg-track-wrap';
  const trackBg = document.createElement('div');
  trackBg.className = 'mp-pg-track-bg';
  const trackFill = document.createElement('div');
  trackFill.className = 'mp-pg-track-fill';
  trackBg.append(trackFill);

  const thumb = document.createElement('div');
  thumb.className = 'mp-pg-thumb';

  const seekInput = document.createElement('input');
  seekInput.type = 'range';
  seekInput.min = '0';
  seekInput.max = '100';
  seekInput.step = '0.25';
  seekInput.value = '0';
  seekInput.className = 'mp-pg-seek-input';
  seekInput.setAttribute('aria-label', 'Seek track position');
  seekInput.addEventListener('input', () => {
    const pct = Number(seekInput.value);
    trackFill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    const dur = ctx.getState().duration;
    if (dur > 0) {
      void ctx.playback.seek((pct / 100) * dur);
    }
  });
  trackWrap.append(trackBg, thumb, seekInput);

  const remEl = document.createElement('div');
  remEl.className = 'mp-pg-remaining';
  remEl.textContent = '-0:00';
  scrub.append(trackWrap, remEl);

  // Transport Trio: Prev | Coral-Red Play/Pause | Next
  const transport = document.createElement('div');
  transport.className = 'mp-pg-transport';
  const prevTrig = pgTrigger(
    playerTarget,
    'previous',
    'Previous track',
    '--pg-nav',
    `<span class="mp-pg-ring-core">${PG_ICON_PREV}</span>`,
    true,
  );
  const playTrig = pgTrigger(
    playerTarget,
    'togglePlay',
    'Play or pause',
    '--pg-play',
    `<span class="mp-pg-play-core">${PG_ICON_PLAY}</span>`,
    true,
  );
  const nextTrig = pgTrigger(
    playerTarget,
    'next',
    'Next track',
    '--pg-nav',
    `<span class="mp-pg-ring-core">${PG_ICON_NEXT}</span>`,
    true,
  );
  transport.append(prevTrig, playTrig, nextTrig);

  // Bottom frosted utility bar
  const util = document.createElement('div');
  util.className = 'mp-pg-util';
  const volBox = document.createElement('div');
  volBox.className = 'mp-pg-vol';
  const volLbl = document.createElement('span');
  volLbl.textContent = 'VOL';
  const volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.min = '0';
  volInput.max = '1';
  volInput.step = '0.01';
  volInput.setAttribute('aria-label', 'Volume');
  volInput.addEventListener('input', () => {
    void ctx.playback.setVolume(Number(volInput.value));
  });
  volBox.append(volLbl, volInput);

  const dualBtn = document.createElement('button');
  dualBtn.type = 'button';
  dualBtn.className = 'mp-pg-chip';
  dualBtn.textContent = viewMode === 'dual' ? '1 Card' : '2 Cards';
  dualBtn.title = 'Toggle side-by-side glass cards';
  dualBtn.addEventListener('click', () => setView(viewMode === 'dual' ? 'player' : 'dual'));

  const addTrig = pgTrigger(playerTarget, 'openFilePicker', 'Add audio files', '--pg-chip', '+ Files');
  util.append(volBox, addTrig, dualBtn);

  if (pgIsDesktop()) {
    util.append(
      pgTrigger(playerTarget, 'toggleAlwaysOnTop', 'Pin window on top', '--pg-chip', '⊤'),
      pgTrigger(playerTarget, 'minimizeWindow', 'Minimize window', '--pg-chip', '—'),
      pgTrigger(playerTarget, 'closeWindow', 'Close window', '--pg-chip', '×'),
    );
  }

  playerCard.append(topBar, artWrap, meta, scrub, transport, util);

  // ==================== CARD 2: COLLECTIONS & RECOMMENDED ====================
  const libraryCard = document.createElement('div');
  libraryCard.className = 'mp-pg-card --library';

  const libTop = document.createElement('div');
  libTop.className = 'mp-pg-topbar';
  libTop.setAttribute('data-tauri-drag-region', '');

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'mp-pg-ring-btn';
  searchBtn.setAttribute('aria-label', 'Search tracks');
  searchBtn.title = 'Search tracks';
  searchBtn.innerHTML = `<span class="mp-pg-ring-core">${PG_ICON_SEARCH}</span>`;
  searchBtn.addEventListener('click', () => {
    searchOpen = !searchOpen;
    searchRow.className = searchOpen ? 'mp-pg-search-row --open' : 'mp-pg-search-row';
    if (!searchOpen && searchQuery) {
      searchQuery = '';
      searchInput.value = '';
      renderTrackList(ctx.getState());
    }
  });

  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.className = 'mp-pg-ring-btn';
  gridBtn.setAttribute('aria-label', 'Back to Listen now view');
  gridBtn.title = 'Back to Listen now';
  gridBtn.innerHTML = `<span class="mp-pg-ring-core">${PG_ICON_GRID}</span>`;
  gridBtn.addEventListener('click', () => setView('player'));

  libTop.append(searchBtn, gridBtn);

  const searchRow = document.createElement('div');
  searchRow.className = 'mp-pg-search-row';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'mp-pg-search-input';
  searchInput.placeholder = 'Filter tracks or artists…';
  searchInput.setAttribute('aria-label', 'Filter tracks');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderTrackList(ctx.getState());
  });
  searchRow.append(searchInput);

  // Collections squircle strip
  const collLbl = document.createElement('div');
  collLbl.className = 'mp-pg-section-lbl';
  collLbl.textContent = 'Collections';

  const collRow = document.createElement('div');
  collRow.className = 'mp-pg-collections';

  const collDefs: Array<{ id: PrismCollectionFilter; label: string; art: string }> = [
    { id: 'all', label: 'All Mix', art: COLL_ART_ALL },
    { id: 'chill', label: 'Chillout', art: COLL_ART_CHILL },
    { id: 'focus', label: 'Focus', art: COLL_ART_FOCUS },
  ];
  const collEls = new Map<PrismCollectionFilter, { btn: HTMLButtonElement; countEl: HTMLDivElement }>();

  for (const def of collDefs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = def.id === activeCollection ? 'mp-pg-coll --active' : 'mp-pg-coll';
    const frame = document.createElement('div');
    frame.className = 'mp-pg-coll-frame';
    const art = document.createElement('div');
    art.className = 'mp-pg-coll-art';
    art.innerHTML = def.art;
    frame.append(art);
    const name = document.createElement('div');
    name.className = 'mp-pg-coll-name';
    name.textContent = def.label;
    const countEl = document.createElement('div');
    countEl.className = 'mp-pg-coll-count';
    countEl.textContent = '0 songs';
    btn.append(frame, name, countEl);
    btn.addEventListener('click', () => {
      activeCollection = def.id;
      for (const [k, item] of collEls.entries()) {
        item.btn.className = k === activeCollection ? 'mp-pg-coll --active' : 'mp-pg-coll';
      }
      renderTrackList(ctx.getState());
    });
    collEls.set(def.id, { btn, countEl });
    collRow.append(btn);
  }

  // Recommended tracklist
  const recLbl = document.createElement('div');
  recLbl.className = 'mp-pg-section-lbl';
  recLbl.textContent = 'Recommended';

  const listEl = document.createElement('div');
  listEl.className = 'mp-pg-list';

  // Floating bottom frosted mini-player pill
  const mini = document.createElement('div');
  mini.className = 'mp-pg-mini';
  const miniPlayTrig = pgTrigger(
    playerTarget,
    'togglePlay',
    'Play or pause',
    '--pg-mini-play',
    `<span class="mp-pg-play-core">${PG_ICON_PLAY_SM}</span>`,
    true,
  );
  const miniMeta = document.createElement('div');
  miniMeta.className = 'mp-pg-mini-meta';
  const miniTitle = document.createElement('div');
  miniTitle.className = 'mp-pg-mini-title';
  const miniSub = document.createElement('div');
  miniSub.className = 'mp-pg-mini-sub';
  miniMeta.append(miniTitle, miniSub);

  const miniBtns = document.createElement('div');
  miniBtns.className = 'mp-pg-mini-btns';
  miniBtns.append(
    pgTrigger(
      playerTarget,
      'previous',
      'Previous track',
      '--pg-mini-nav',
      `<span class="mp-pg-ring-core">${PG_ICON_PREV}</span>`,
      true,
    ),
    pgTrigger(
      playerTarget,
      'next',
      'Next track',
      '--pg-mini-nav',
      `<span class="mp-pg-ring-core">${PG_ICON_NEXT}</span>`,
      true,
    ),
  );
  mini.append(miniPlayTrig, miniMeta, miniBtns);

  libraryCard.append(libTop, searchRow, collLbl, collRow, recLbl, listEl, mini);

  stage.append(playerCard, libraryCard);
  container.innerHTML = '';
  container.append(stage);

  const updateProgress = (currentTime: number, duration: number) => {
    const pct = computeGlassProgress(currentTime, duration);
    trackFill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    seekInput.value = String(pct);
    remEl.textContent = formatGlassRemaining(currentTime, duration);
  };

  const renderTrackList = (snap: PlayerSnapshot) => {
    const filtered = filterPrismTracks(snap.tracks, activeCollection, searchQuery);
    listEl.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mp-pg-row';
      const m = document.createElement('div');
      m.className = 'mp-pg-row-meta';
      const t = document.createElement('div');
      t.className = 'mp-pg-row-title';
      t.textContent = snap.tracks.length === 0 ? 'No tracks queued yet' : 'No matching tracks';
      const s = document.createElement('div');
      s.className = 'mp-pg-row-sub';
      s.textContent = snap.tracks.length === 0 ? 'Drop audio files or click + Files' : 'Try clearing the search filter';
      m.append(t, s);
      empty.append(m);
      listEl.append(empty);
      return;
    }

    for (const { track, index } of filtered) {
      const isCurrent = index === snap.currentIndex;
      const row = document.createElement('div');
      row.className = isCurrent ? 'mp-pg-row --active' : 'mp-pg-row';

      const m = document.createElement('div');
      m.className = 'mp-pg-row-meta';
      const t = document.createElement('div');
      t.className = 'mp-pg-row-title';
      t.textContent = track.title;
      const s = document.createElement('div');
      s.className = 'mp-pg-row-sub';
      s.textContent = track.artist || track.album || track.format || 'Audio';
      m.append(t, s);

      const badge = document.createElement('span');
      badge.className = 'mp-pg-row-play';
      const iconHtml = isCurrent && snap.status === 'playing' ? PG_ICON_PAUSE_SM : PG_ICON_PLAY_SM;
      badge.innerHTML = `<span class="mp-pg-ring-core --coral">${iconHtml}</span>`;

      row.append(m, badge);
      row.addEventListener('click', () => {
        if (isCurrent) {
          void ctx.playback.togglePlay();
        } else {
          const hostEl = document.querySelector(playerTarget) as (HTMLElement & { playTrack?: (i: number) => Promise<void> }) | null;
          void hostEl?.playTrack?.(index);
        }
      });
      listEl.append(row);
    }
  };

  const sync = (snap: PlayerSnapshot) => {
    stage.dataset.pgStatus = snap.status;
    const tr = snap.currentTrack;
    titleEl.textContent = tr?.title || 'Drop audio files or click + Files';
    artistEl.textContent = tr?.artist || 'Prism Glass · Ready';
    miniTitle.textContent = tr?.title || 'Prism Glass';
    miniSub.textContent = tr?.artist || 'Ready to play';

    updateProgress(snap.currentTime, snap.duration);
    volInput.value = String(snap.volume);

    const playBtn = playTrig.querySelector('button');
    if (playBtn) {
      playBtn.innerHTML = `<span class="mp-pg-play-core">${snap.status === 'playing' ? PG_ICON_PAUSE : PG_ICON_PLAY}</span>`;
    }
    const miniPlayBtn = miniPlayTrig.querySelector('button');
    if (miniPlayBtn) {
      miniPlayBtn.innerHTML = `<span class="mp-pg-play-core">${snap.status === 'playing' ? PG_ICON_PAUSE_SM : PG_ICON_PLAY_SM}</span>`;
    }

    const allCount = snap.tracks.length;
    const chillCount = filterPrismTracks(snap.tracks, 'chill', '').length;
    const focusCount = filterPrismTracks(snap.tracks, 'focus', '').length;
    const setCount = (id: PrismCollectionFilter, n: number) => {
      const item = collEls.get(id);
      if (item) item.countEl.textContent = `${n} ${n === 1 ? 'song' : 'songs'}`;
    };
    setCount('all', allCount);
    setCount('chill', chillCount);
    setCount('focus', focusCount);

    renderTrackList(snap);
  };

  sync(ctx.getState());
  const offState = ctx.on('stateChange', sync);
  const offTime = ctx.on('timeUpdate', ({ currentTime, duration }) => updateProgress(currentTime, duration));
  const offTrack = ctx.on('trackChange', () => sync(ctx.getState()));

  return () => {
    offState();
    offTime();
    offTrack();
    container.innerHTML = '';
  };
}
