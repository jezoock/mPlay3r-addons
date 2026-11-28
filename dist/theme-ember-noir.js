// mPlay3r addon bundle: mplay3r.theme-ember-noir@1.0.0 (generated from plugins/theme-ember-noir/src)

const EMBER_NOIR_THEME_ID = 'ember-noir';
const EMBER_NOIR_THEME_KEY = 'mplay3r.theme-ember-noir:ember-noir';
const EMBER_ROSE_SVG = `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="en-bg" cx="46%" cy="44%" r="62%">
      <stop offset="0%" stop-color="#2a2d33"/>
      <stop offset="52%" stop-color="#17191e"/>
      <stop offset="100%" stop-color="#0b0c0f"/>
    </radialGradient>
    <radialGradient id="en-ember" cx="50%" cy="48%" r="48%">
      <stop offset="0%" stop-color="#ff6b24" stop-opacity="0.95"/>
      <stop offset="38%" stop-color="#d92b04" stop-opacity="0.72"/>
      <stop offset="72%" stop-color="#3a0d08" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0b0c0f" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="en-petal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#363a42"/>
      <stop offset="55%" stop-color="#181a1f"/>
      <stop offset="100%" stop-color="#0c0d10"/>
    </linearGradient>
    <linearGradient id="en-petal-glow" x1="15%" y1="15%" x2="85%" y2="90%">
      <stop offset="0%" stop-color="#ff5a1f"/>
      <stop offset="45%" stop-color="#4e160d"/>
      <stop offset="100%" stop-color="#14161a"/>
    </linearGradient>
  </defs>
  <rect width="220" height="220" fill="url(#en-bg)"/>
  <circle cx="116" cy="96" r="88" fill="url(#en-ember)" opacity="0.55"/>
  <!-- Outer sculpted obsidian rose leaves -->
  <path d="M28 128 C20 88, 62 66, 98 84 C74 108, 66 142, 42 152 Z" fill="url(#en-petal)" stroke="#2e3239" stroke-width="1"/>
  <path d="M188 134 C202 92, 162 56, 126 76 C148 106, 152 146, 174 162 Z" fill="url(#en-petal)" stroke="#2e3239" stroke-width="1"/>
  <path d="M68 176 C44 150, 62 114, 108 118 C126 144, 114 182, 86 188 Z" fill="url(#en-petal)" stroke="#292d34" stroke-width="1"/>
  <path d="M158 176 C182 146, 162 108, 122 116 C110 144, 124 182, 148 186 Z" fill="url(#en-petal)" stroke="#292d34" stroke-width="1"/>
  <path d="M58 58 C88 26, 142 26, 168 62 C136 74, 94 74, 58 58 Z" fill="url(#en-petal)" stroke="#333842" stroke-width="1"/>
  <!-- Central rose petals with smoldering ember rims -->
  <ellipse cx="112" cy="94" rx="46" ry="42" fill="url(#en-petal)" stroke="#481a10" stroke-width="1.4"/>
  <path d="M74 92 C78 60, 122 52, 144 74 C156 96, 138 128, 106 128 C82 126, 70 110, 74 92 Z" fill="url(#en-petal-glow)" opacity="0.9"/>
  <path d="M88 92 C92 70, 122 66, 134 84 C140 102, 124 118, 104 116 C90 114, 84 104, 88 92 Z" fill="#181a1f" stroke="#ff5c1a" stroke-width="1.4"/>
  <path d="M98 92 C102 78, 120 78, 124 92 C126 104, 114 110, 104 106 C98 103, 96 97, 98 92 Z" fill="#2c120d" stroke="#ff822e" stroke-width="1.4"/>
  <circle cx="111" cy="93" r="6" fill="#ff5514" opacity="0.9"/>
  <circle cx="111" cy="93" r="2.5" fill="#ffd166"/>
  <!-- Secondary side dark buds -->
  <circle cx="62" cy="126" r="24" fill="url(#en-petal)" stroke="#333842" stroke-width="1"/>
  <circle cx="62" cy="126" r="12" fill="#13151a" stroke="#7c2814" stroke-width="1"/>
  <circle cx="158" cy="128" r="22" fill="url(#en-petal)" stroke="#333842" stroke-width="1"/>
  <circle cx="158" cy="128" r="10" fill="#13151a" stroke="#8a2c14" stroke-width="1"/>
  <!-- Floating glowing embers -->
  <circle cx="76" cy="64" r="1.8" fill="#ff7324"/>
  <circle cx="148" cy="68" r="1.4" fill="#ffb84d"/>
  <circle cx="164" cy="108" r="1.6" fill="#ff4d12"/>
  <circle cx="52" cy="148" r="1.8" fill="#ff5c1a"/>
  <circle cx="136" cy="154" r="1.6" fill="#ff7c2b"/>
  <circle cx="94" cy="144" r="1.3" fill="#ff9e3d"/>
  <circle cx="128" cy="54" r="1.2" fill="#ff5514"/>
  <circle cx="84" cy="162" r="1.2" fill="#ff6a1f"/>
</svg>`;
const EMBER_NOIR_CSS = `
@keyframes mp-en-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.mp-en-stage {
  --en-bg-top: #31363f;
  --en-bg-mid: #24282f;
  --en-bg-bot: #1a1d22;
  --en-surface: #252931;
  --en-hi: #373d47;
  --en-lo: #101216;
  --en-text: #e3e7ee;
  --en-muted: #7b8391;
  --en-ember-1: #ff5b1f;
  --en-ember-2: #e63900;
  --en-ember-3: #b32600;
  --en-gold: #f5c02e;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--en-text);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 18px;
  user-select: none;
  padding: 6px;
}
.mp-en-card {
  position: relative;
  width: 318px;
  max-width: 100%;
  border-radius: 34px;
  padding: 20px 22px 24px 22px;
  background: linear-gradient(170deg, var(--en-bg-top) 0%, var(--en-bg-mid) 44%, var(--en-bg-bot) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 18px 24px 48px rgba(0, 0, 0, 0.62), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.mp-desktop-frameless .mp-en-stage {
  padding: 0;
}
.mp-desktop-frameless .mp-en-card {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.mp-en-stage[data-en-view="player"] .mp-en-card.--playlist {
  display: none;
}
.mp-en-stage[data-en-view="playlist"] .mp-en-card.--player {
  display: none;
}
.mp-en-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 18px;
  cursor: grab;
}
.mp-en-topbar:active {
  cursor: grabbing;
}
.mp-en-topbar.--centered {
  justify-content: center;
  position: relative;
  min-height: 28px;
  margin-bottom: 16px;
}
.mp-en-caption {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--en-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
  text-align: center;
}
.mp-en-win-bar {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
}
.mp-en-win-bar ds-trigger button {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(145deg, #2d323a, #1d2026);
  color: var(--en-muted);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 3px 3px 6px var(--en-lo), -2px -2px 5px var(--en-hi);
}
.mp-en-win-bar ds-trigger button:hover {
  color: var(--en-text);
}
.mp-en-circle,
.mp-en-card ds-trigger.--en-circle button {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid #262a32;
  background: linear-gradient(145deg, #2f343d 0%, #1d2026 100%);
  color: #9ba3b2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 6px 6px 14px var(--en-lo), -5px -5px 12px var(--en-hi);
  transition: transform 100ms ease, box-shadow 140ms ease, color 140ms ease;
}
.mp-en-circle:hover,
.mp-en-card ds-trigger.--en-circle button:hover {
  color: var(--en-text);
}
.mp-en-circle:active,
.mp-en-card ds-trigger.--en-circle button:active {
  transform: scale(0.96);
  box-shadow: inset 4px 4px 10px var(--en-lo), inset -4px -4px 9px var(--en-hi);
}
.mp-en-circle.--liked {
  color: var(--en-ember-1);
  box-shadow: inset 3px 3px 7px var(--en-lo), inset -3px -3px 7px var(--en-hi), 0 0 12px rgba(255, 91, 31, 0.28);
}
.mp-en-art-wrap {
  display: flex;
  justify-content: center;
  margin: 6px 0 24px 0;
}
.mp-en-medallion {
  position: relative;
  width: 196px;
  height: 196px;
  border-radius: 50%;
  padding: 7px;
  background: linear-gradient(145deg, #262a31, #17191e);
  box-shadow: 16px 16px 34px #0e1014, -10px -10px 26px #343a44;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-en-medallion.--small {
  width: 98px;
  height: 98px;
  padding: 5px;
  box-shadow: 10px 10px 22px #0e1014, -7px -7px 16px #343a44;
}
.mp-en-disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #14161a;
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.85);
  animation: mp-en-spin 24s linear infinite;
  animation-play-state: paused;
}
.mp-en-stage[data-en-status="playing"] .mp-en-disc {
  animation-play-state: running;
}
.mp-en-disc svg,
.mp-en-disc img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mp-en-meta {
  text-align: center;
  margin-bottom: 20px;
}
.mp-en-title {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--en-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-en-artist {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--en-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-en-scrub-block {
  margin-bottom: 24px;
}
.mp-en-times {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--en-muted);
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
}
.mp-en-track-wrap {
  position: relative;
  height: 22px;
  display: flex;
  align-items: center;
}
.mp-en-track-bg {
  position: relative;
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: #131519;
  box-shadow: inset 1px 1px 3px #090a0c, 0 1px 0 rgba(255, 255, 255, 0.06);
}
.mp-en-track-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff3d00 0%, #ff7b00 58%, #f5c02e 100%);
  box-shadow: 0 0 8px rgba(255, 115, 0, 0.45);
}
.mp-en-thumb {
  position: absolute;
  top: 50%;
  left: 0%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(145deg, #323740, #1a1d22);
  border: 2px solid #282c34;
  box-shadow: 4px 4px 10px #0d0e11, -3px -3px 8px #383e48;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-en-thumb::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--en-gold);
  box-shadow: 0 0 7px rgba(245, 192, 46, 0.85);
}
.mp-en-seek-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.mp-en-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 18px;
}
.mp-en-card ds-trigger.--en-nav button {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 2px solid #262b33;
  background: linear-gradient(145deg, #2e333c 0%, #1c1f25 100%);
  color: #9ba3b2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 8px 8px 18px var(--en-lo), -6px -6px 15px var(--en-hi);
  transition: transform 100ms ease, box-shadow 140ms ease, color 140ms ease;
}
.mp-en-card ds-trigger.--en-nav button:hover {
  color: var(--en-text);
}
.mp-en-card ds-trigger.--en-nav button:active {
  transform: scale(0.96);
  box-shadow: inset 5px 5px 12px var(--en-lo), inset -4px -4px 10px var(--en-hi);
}
.mp-en-card ds-trigger.--en-play button {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 3px solid #2a2f37;
  background: linear-gradient(135deg, var(--en-ember-1) 0%, var(--en-ember-2) 56%, var(--en-ember-3) 100%);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 8px 10px 22px rgba(0, 0, 0, 0.55), -5px -5px 14px #353b45, 0 6px 20px rgba(230, 57, 0, 0.36);
  transition: transform 100ms ease, filter 140ms ease;
}
.mp-en-card ds-trigger.--en-play button:hover {
  filter: brightness(1.07);
}
.mp-en-card ds-trigger.--en-play button:active {
  transform: scale(0.95);
}
.mp-en-util {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.mp-en-vol {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 10px;
  font-weight: 700;
  color: var(--en-muted);
}
.mp-en-vol input[type="range"] {
  width: 100%;
  accent-color: var(--en-ember-1);
  cursor: pointer;
}
.mp-en-chip,
.mp-en-util ds-trigger.--en-chip button {
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: linear-gradient(145deg, #2d323b, #1d2026);
  color: var(--en-muted);
  border-radius: 999px;
  padding: 4px 9px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 3px 3px 7px var(--en-lo), -2px -2px 6px var(--en-hi);
}
.mp-en-chip:hover,
.mp-en-util ds-trigger.--en-chip button:hover {
  color: var(--en-text);
  border-color: rgba(255, 91, 31, 0.45);
}
/* Tracklist Card (Right view from reference design) */
.mp-en-pl-hero {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 10px;
  margin-bottom: 22px;
}
.mp-en-pl-list-wrap {
  position: relative;
  flex: 1;
}
.mp-en-pl-list {
  max-height: 296px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 26px;
}
.mp-en-pl-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 36px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(26, 29, 34, 0), var(--en-bg-bot));
}
.mp-en-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}
.mp-en-row:hover {
  background: rgba(255, 255, 255, 0.025);
}
.mp-en-row.--active {
  background: linear-gradient(90deg, #16181d 0%, #1d2027 100%);
  border-color: rgba(255, 255, 255, 0.05);
  box-shadow: inset 2px 2px 6px #0c0e11, 0 8px 20px rgba(0, 0, 0, 0.36);
}
.mp-en-row-meta {
  min-width: 0;
  flex: 1;
}
.mp-en-row-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #d6dbe3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-en-row.--active .mp-en-row-title {
  color: #ffffff;
}
.mp-en-row-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--en-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-en-row-btn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid #252931;
  background: linear-gradient(145deg, #2d323b 0%, #1c1f25 100%);
  color: #8f98a6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 4px 4px 10px var(--en-lo), -3px -3px 8px var(--en-hi);
}
.mp-en-row.--active .mp-en-row-btn {
  border-color: #2c2420;
  background: linear-gradient(135deg, var(--en-ember-1) 0%, var(--en-ember-2) 60%, var(--en-ember-3) 100%);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(230, 57, 0, 0.48);
}
`;
function formatEmberTime(seconds) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const mins = Math.floor(safe / 60);
    const rem = safe % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
}
function computeProgressPercent(currentTime, duration) {
    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(100, currentTime / duration * 100));
}
function enSvg(pathMarkup, size = 16) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${pathMarkup}</svg>`;
}
const ICON_BACK = enSvg('<path d="M19 11H7.83l4.88-4.88-1.42-1.42L4 12l7.29 7.29 1.42-1.41L7.83 13H19v-2z"/>', 15);
const ICON_MENU = enSvg('<path d="M4 7h16v2H4V7zm0 4.5h16v2H4v-2zM4 16h16v2H4v-2z"/>', 15);
const ICON_HEART = enSvg('<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>', 14);
const ICON_MORE = enSvg('<circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>', 15);
const ICON_PREV = enSvg('<path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>', 17);
const ICON_NEXT = enSvg('<path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>', 17);
const ICON_PLAY = enSvg('<path d="M8 5v14l11-7z"/>', 20);
const ICON_PAUSE = enSvg('<path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z"/>', 20);
const ICON_PLAY_SM = enSvg('<path d="M8 5v14l11-7z"/>', 12);
const ICON_PAUSE_SM = enSvg('<path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z"/>', 12);
function enTrigger(target, action, label, cls, content, isHtml = false) {
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
function enIsDesktop() {
    return typeof globalThis !== 'undefined' && Boolean(globalThis.__TAURI_INTERNALS__);
}
function applyEmberNoirTheme(playerTarget, themeKey) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(playerTarget);
    if (el && typeof el.getPluginHost === 'function') {
        void el.getPluginHost().then((host)=>host.setActiveTheme(themeKey));
    }
}
function mountEmberNoirLayout(ctx, container, playerTarget, options) {
    let viewMode = options.initialView;
    const favorites = new Set(options.initialFavorites);
    const stage = document.createElement('div');
    stage.className = 'mp-en-stage';
    stage.dataset.enView = viewMode;
    const setView = (next)=>{
        viewMode = next;
        stage.dataset.enView = next;
        dualBtn.textContent = next === 'dual' ? '1 Card' : '2 Cards';
        options.onViewChange(next);
    };
    const playerCard = document.createElement('div');
    playerCard.className = 'mp-en-card --player';
    const topBar = document.createElement('div');
    topBar.className = 'mp-en-topbar';
    topBar.setAttribute('data-tauri-drag-region', '');
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'mp-en-circle';
    backBtn.setAttribute('aria-label', 'Switch back to Minimal theme');
    backBtn.title = 'Return to Minimal UI';
    backBtn.innerHTML = ICON_BACK;
    backBtn.addEventListener('click', ()=>applyEmberNoirTheme(playerTarget, null));
    const playingCaption = document.createElement('span');
    playingCaption.className = 'mp-en-caption';
    playingCaption.textContent = 'PLAYING NOW';
    playingCaption.setAttribute('data-tauri-drag-region', '');
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'mp-en-circle';
    menuBtn.setAttribute('aria-label', 'Toggle tracklist view');
    menuBtn.title = 'Open Tracklist view';
    menuBtn.innerHTML = ICON_MENU;
    menuBtn.addEventListener('click', ()=>setView(viewMode === 'playlist' ? 'player' : 'playlist'));
    topBar.append(backBtn, playingCaption, menuBtn);
    const artWrap = document.createElement('div');
    artWrap.className = 'mp-en-art-wrap';
    const medallion = document.createElement('div');
    medallion.className = 'mp-en-medallion';
    const discMain = document.createElement('div');
    discMain.className = 'mp-en-disc';
    discMain.innerHTML = EMBER_ROSE_SVG;
    medallion.append(discMain);
    artWrap.append(medallion);
    const meta = document.createElement('div');
    meta.className = 'mp-en-meta';
    const titleEl = document.createElement('div');
    titleEl.className = 'mp-en-title';
    const artistEl = document.createElement('div');
    artistEl.className = 'mp-en-artist';
    meta.append(titleEl, artistEl);
    const scrubBlock = document.createElement('div');
    scrubBlock.className = 'mp-en-scrub-block';
    const timesRow = document.createElement('div');
    timesRow.className = 'mp-en-times';
    const curTimeEl = document.createElement('span');
    const durTimeEl = document.createElement('span');
    timesRow.append(curTimeEl, durTimeEl);
    const trackWrap = document.createElement('div');
    trackWrap.className = 'mp-en-track-wrap';
    const trackBg = document.createElement('div');
    trackBg.className = 'mp-en-track-bg';
    const trackFill = document.createElement('div');
    trackFill.className = 'mp-en-track-fill';
    trackBg.append(trackFill);
    const thumb = document.createElement('div');
    thumb.className = 'mp-en-thumb';
    const seekInput = document.createElement('input');
    seekInput.type = 'range';
    seekInput.min = '0';
    seekInput.max = '100';
    seekInput.step = '0.25';
    seekInput.value = '0';
    seekInput.className = 'mp-en-seek-input';
    seekInput.setAttribute('aria-label', 'Seek position');
    seekInput.addEventListener('input', ()=>{
        const pct = Number(seekInput.value);
        trackFill.style.width = `${pct}%`;
        thumb.style.left = `${pct}%`;
        const dur = ctx.getState().duration;
        if (dur > 0) {
            void ctx.playback.seek(pct / 100 * dur);
        }
    });
    trackWrap.append(trackBg, thumb, seekInput);
    scrubBlock.append(timesRow, trackWrap);
    const transport = document.createElement('div');
    transport.className = 'mp-en-transport';
    const prevTrig = enTrigger(playerTarget, 'previous', 'Previous track', '--en-nav', ICON_PREV, true);
    const playTrig = enTrigger(playerTarget, 'togglePlay', 'Play or pause', '--en-play', ICON_PLAY, true);
    const nextTrig = enTrigger(playerTarget, 'next', 'Next track', '--en-nav', ICON_NEXT, true);
    transport.append(prevTrig, playTrig, nextTrig);
    const utilRow = document.createElement('div');
    utilRow.className = 'mp-en-util';
    const volBox = document.createElement('div');
    volBox.className = 'mp-en-vol';
    const volTag = document.createElement('span');
    volTag.textContent = 'VOL';
    const volInput = document.createElement('input');
    volInput.type = 'range';
    volInput.min = '0';
    volInput.max = '1';
    volInput.step = '0.01';
    volInput.setAttribute('aria-label', 'Volume');
    volInput.addEventListener('input', ()=>{
        void ctx.playback.setVolume(Number(volInput.value));
    });
    volBox.append(volTag, volInput);
    const dualBtn = document.createElement('button');
    dualBtn.type = 'button';
    dualBtn.className = 'mp-en-chip';
    dualBtn.textContent = viewMode === 'dual' ? '1 Card' : '2 Cards';
    dualBtn.title = 'Toggle side-by-side Now Playing + Tracklist cards';
    dualBtn.addEventListener('click', ()=>setView(viewMode === 'dual' ? 'player' : 'dual'));
    const addTrig = enTrigger(playerTarget, 'openFilePicker', 'Add audio files', '--en-chip', '+ Files');
    utilRow.append(volBox, addTrig, dualBtn);
    if (enIsDesktop()) {
        utilRow.append(enTrigger(playerTarget, 'toggleAlwaysOnTop', 'Pin window on top', '--en-chip', '⊤'), enTrigger(playerTarget, 'minimizeWindow', 'Minimize window', '--en-chip', '—'), enTrigger(playerTarget, 'closeWindow', 'Close window', '--en-chip', '×'));
    }
    playerCard.append(topBar, artWrap, meta, scrubBlock, transport, utilRow);
    const playlistCard = document.createElement('div');
    playlistCard.className = 'mp-en-card --playlist';
    const plTop = document.createElement('div');
    plTop.className = 'mp-en-topbar --centered';
    plTop.setAttribute('data-tauri-drag-region', '');
    const plCaption = document.createElement('span');
    plCaption.className = 'mp-en-caption';
    plCaption.textContent = 'PLAYLIST · MPLAY3R';
    plCaption.setAttribute('data-tauri-drag-region', '');
    plTop.append(plCaption);
    if (enIsDesktop()) {
        const winBar = document.createElement('div');
        winBar.className = 'mp-en-win-bar';
        winBar.append(enTrigger(playerTarget, 'minimizeWindow', 'Minimize window', '--en-win', '—'), enTrigger(playerTarget, 'closeWindow', 'Close window', '--en-win', '×'));
        plTop.append(winBar);
    }
    const plHero = document.createElement('div');
    plHero.className = 'mp-en-pl-hero';
    const heartBtn = document.createElement('button');
    heartBtn.type = 'button';
    heartBtn.className = 'mp-en-circle';
    heartBtn.setAttribute('aria-label', 'Favorite current track');
    heartBtn.innerHTML = ICON_HEART;
    heartBtn.addEventListener('click', ()=>{
        const cur = ctx.getState().currentTrack;
        if (!cur) return;
        if (favorites.has(cur.id)) {
            favorites.delete(cur.id);
        } else {
            favorites.add(cur.id);
        }
        heartBtn.className = favorites.has(cur.id) ? 'mp-en-circle --liked' : 'mp-en-circle';
        options.onFavoritesChange(Array.from(favorites));
    });
    const miniMedallion = document.createElement('div');
    miniMedallion.className = 'mp-en-medallion --small';
    const discMini = document.createElement('div');
    discMini.className = 'mp-en-disc';
    discMini.innerHTML = EMBER_ROSE_SVG;
    miniMedallion.append(discMini);
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'mp-en-circle';
    moreBtn.setAttribute('aria-label', 'Return to Now Playing view');
    moreBtn.title = 'Back to Now Playing';
    moreBtn.innerHTML = ICON_MORE;
    moreBtn.addEventListener('click', ()=>setView('player'));
    plHero.append(heartBtn, miniMedallion, moreBtn);
    const listWrap = document.createElement('div');
    listWrap.className = 'mp-en-pl-list-wrap';
    const listEl = document.createElement('div');
    listEl.className = 'mp-en-pl-list';
    const fadeEl = document.createElement('div');
    fadeEl.className = 'mp-en-pl-fade';
    listWrap.append(listEl, fadeEl);
    playlistCard.append(plTop, plHero, listWrap);
    stage.append(playerCard, playlistCard);
    container.innerHTML = '';
    container.append(stage);
    const updateProgress = (currentTime, duration)=>{
        const pct = computeProgressPercent(currentTime, duration);
        curTimeEl.textContent = formatEmberTime(currentTime);
        durTimeEl.textContent = formatEmberTime(duration);
        trackFill.style.width = `${pct}%`;
        thumb.style.left = `${pct}%`;
        seekInput.value = String(pct);
    };
    const sync = (snap)=>{
        stage.dataset.enStatus = snap.status;
        const tr = snap.currentTrack;
        titleEl.textContent = tr?.title || 'Drop audio files or click + Files';
        artistEl.textContent = tr?.artist || 'Ember Noir · Ready';
        plCaption.textContent = tr ? [
            tr.album,
            tr.artist
        ].filter(Boolean).join(' · ').toUpperCase() || tr.title.toUpperCase() : 'PLAYLIST · MPLAY3R';
        updateProgress(snap.currentTime, snap.duration);
        volInput.value = String(snap.volume);
        const playBtn = playTrig.querySelector('button');
        if (playBtn) {
            playBtn.innerHTML = snap.status === 'playing' ? ICON_PAUSE : ICON_PLAY;
        }
        heartBtn.className = tr && favorites.has(tr.id) ? 'mp-en-circle --liked' : 'mp-en-circle';
        listEl.innerHTML = '';
        if (snap.tracks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'mp-en-row';
            const emptyMeta = document.createElement('div');
            emptyMeta.className = 'mp-en-row-meta';
            const emptyTitle = document.createElement('div');
            emptyTitle.className = 'mp-en-row-title';
            emptyTitle.textContent = 'No tracks loaded yet';
            const emptySub = document.createElement('div');
            emptySub.className = 'mp-en-row-sub';
            emptySub.textContent = 'Drop audio files or click + Files';
            emptyMeta.append(emptyTitle, emptySub);
            empty.append(emptyMeta);
            listEl.append(empty);
            return;
        }
        snap.tracks.forEach((item, idx)=>{
            const active = idx === snap.currentIndex;
            const row = document.createElement('div');
            row.className = active ? 'mp-en-row --active' : 'mp-en-row';
            const rowMeta = document.createElement('div');
            rowMeta.className = 'mp-en-row-meta';
            const rowTitle = document.createElement('div');
            rowTitle.className = 'mp-en-row-title';
            rowTitle.textContent = item.title;
            const rowSub = document.createElement('div');
            rowSub.className = 'mp-en-row-sub';
            rowSub.textContent = item.artist || item.album || item.format || 'Audio Track';
            rowMeta.append(rowTitle, rowSub);
            const badgeBtn = document.createElement('span');
            badgeBtn.className = 'mp-en-row-btn';
            badgeBtn.innerHTML = active && snap.status === 'playing' ? ICON_PAUSE_SM : ICON_PLAY_SM;
            row.append(rowMeta, badgeBtn);
            row.addEventListener('click', ()=>{
                if (active) {
                    void ctx.playback.togglePlay();
                } else {
                    const hostEl = document.querySelector(playerTarget);
                    void hostEl?.playTrack?.(idx);
                }
            });
            listEl.append(row);
        });
    };
    sync(ctx.getState());
    const offState = ctx.on('stateChange', sync);
    const offTime = ctx.on('timeUpdate', ({ currentTime, duration })=>updateProgress(currentTime, duration));
    const offTrack = ctx.on('trackChange', ()=>sync(ctx.getState()));
    return ()=>{
        offState();
        offTime();
        offTrack();
        container.innerHTML = '';
    };
}

const VIEW_MODE_KEY = 'emberNoirView';
const FAVORITES_KEY = 'emberNoirFavorites';
export const manifest = {
    id: 'mplay3r.theme-ember-noir',
    name: 'Ember Noir Dark Neumorph Theme',
    version: '1.0.0',
    description: 'Ultra-sleek matte charcoal dark-neumorphic structural theme with fiery ember-orange Play/Pause button, obsidian smoldering-rose circular medallion, ember-to-gold scrubber with glowing amber dot, dual Now Playing / Tracklist views, favorites persistence, and frameless desktop drag support.',
    category: 'theme',
    permissions: [
        'theme',
        'ui-slot',
        'playback-control',
        'storage'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
export const plugin = {
    manifest,
    async activate (ctx) {
        const savedView = await ctx.storage.get(VIEW_MODE_KEY);
        let currentView = savedView === 'playlist' || savedView === 'dual' ? savedView : 'player';
        const savedFavs = await ctx.storage.get(FAVORITES_KEY);
        let currentFavorites = Array.isArray(savedFavs) ? savedFavs.filter((id)=>typeof id === 'string') : [];
        ctx.registerTheme({
            id: EMBER_NOIR_THEME_ID,
            name: 'Ember Noir Dark Neumorph',
            css: EMBER_NOIR_CSS,
            mountLayout: (container, target)=>mountEmberNoirLayout(ctx, container, target, {
                    initialView: currentView,
                    initialFavorites: currentFavorites,
                    onViewChange: (nextView)=>{
                        currentView = nextView;
                        void ctx.storage.set(VIEW_MODE_KEY, nextView);
                    },
                    onFavoritesChange: (nextFavs)=>{
                        currentFavorites = nextFavs;
                        void ctx.storage.set(FAVORITES_KEY, nextFavs);
                    }
                })
        });
        ctx.registerSlot({
            id: 'ember-noir-panel',
            slot: 'panel',
            title: 'Ember Noir',
            mount (container) {
                container.innerHTML = '';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
                const info = document.createElement('span');
                info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
                info.textContent = 'Ember Noir Dark Neumorph (Charcoal + Fiery Orange + Dual View)';
                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:0.4rem';
                const applyBtn = document.createElement('button');
                applyBtn.type = 'button';
                applyBtn.textContent = 'Apply Ember Noir';
                applyBtn.style.cssText = 'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid #ff5b1f;background:linear-gradient(135deg,#ff5b1f,#d93000);color:#ffffff;font-size:0.74rem;font-weight:700;cursor:pointer';
                applyBtn.addEventListener('click', ()=>applyEmberNoirTheme(ctx.playerTarget, EMBER_NOIR_THEME_KEY));
                const minBtn = document.createElement('button');
                minBtn.type = 'button';
                minBtn.textContent = 'Minimal';
                minBtn.style.cssText = 'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
                minBtn.addEventListener('click', ()=>applyEmberNoirTheme(ctx.playerTarget, null));
                btns.append(applyBtn, minBtn);
                row.append(info, btns);
                container.append(row);
                return ()=>{
                    container.innerHTML = '';
                };
            }
        });
    }
};
export default plugin;
