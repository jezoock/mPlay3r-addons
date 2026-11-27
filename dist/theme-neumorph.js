// mPlay3r addon bundle: mplay3r.theme-neumorph@1.0.0 (generated from plugins/theme-neumorph/src)

const NEUMORPH_THEME_ID = 'neumorph-soft';
const NEUMORPH_THEME_KEY = 'mplay3r.theme-neumorph:neumorph-soft';
const NEUMORPH_CSS = `
.mp-nm-deck {
  --nm-bg: #e6ebf2;
  --nm-surface: #e6ebf2;
  --nm-hi: #ffffff;
  --nm-lo: #c3cbd8;
  --nm-text: #273142;
  --nm-muted: #68758b;
  --nm-accent: #4f6ef7;
  --nm-accent-glow: rgba(79, 110, 247, 0.28);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--nm-bg);
  color: var(--nm-text);
  border-radius: 26px;
  padding: 18px;
  max-width: 440px;
  user-select: none;
  box-shadow: 12px 12px 26px var(--nm-lo), -10px -10px 24px var(--nm-hi);
  border: 1px solid rgba(255, 255, 255, 0.45);
  transition: background 200ms ease, color 200ms ease;
}
.mp-nm-deck[data-nm-mode="dark"] {
  --nm-bg: #222730;
  --nm-surface: #222730;
  --nm-hi: #2d3340;
  --nm-lo: #14181f;
  --nm-text: #e6ecf5;
  --nm-muted: #8b96aa;
  --nm-accent: #6c8cff;
  --nm-accent-glow: rgba(108, 140, 255, 0.32);
  border-color: rgba(255, 255, 255, 0.06);
}
.mp-nm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
  cursor: grab;
}
.mp-nm-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--nm-muted);
}
.mp-nm-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--nm-accent);
  box-shadow: 0 0 10px var(--nm-accent-glow);
}
.mp-nm-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mp-nm-pill,
.mp-nm-deck ds-trigger button {
  border: none;
  background: var(--nm-surface);
  color: var(--nm-text);
  border-radius: 999px;
  padding: 6px 11px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 4px 4px 9px var(--nm-lo), -4px -4px 9px var(--nm-hi);
  transition: box-shadow 120ms ease, color 120ms ease, transform 90ms ease;
}
.mp-nm-pill:hover,
.mp-nm-deck ds-trigger button:hover {
  color: var(--nm-accent);
}
.mp-nm-pill:active,
.mp-nm-deck ds-trigger button:active {
  box-shadow: inset 3px 3px 7px var(--nm-lo), inset -3px -3px 7px var(--nm-hi);
  transform: scale(0.98);
}
.mp-nm-well {
  border-radius: 18px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: var(--nm-surface);
  box-shadow: inset 6px 6px 12px var(--nm-lo), inset -6px -6px 12px var(--nm-hi);
}
.mp-nm-well-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.mp-nm-title {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-nm-clock {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--nm-accent);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.mp-nm-sub {
  font-size: 12px;
  color: var(--nm-muted);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-nm-trough {
  margin-top: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  box-shadow: inset 3px 3px 6px var(--nm-lo), inset -3px -3px 6px var(--nm-hi);
  display: flex;
  align-items: center;
  gap: 8px;
}
.mp-nm-range {
  width: 100%;
  accent-color: var(--nm-accent);
  cursor: pointer;
}
.mp-nm-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
}
.mp-nm-transport ds-trigger button {
  width: 42px;
  height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.mp-nm-play-wrap ds-trigger button {
  width: 54px;
  height: 54px;
  font-size: 17px;
  color: var(--nm-accent);
  box-shadow: 6px 6px 14px var(--nm-lo), -6px -6px 14px var(--nm-hi);
}
.mp-nm-deck[data-nm-status="playing"] .mp-nm-play-wrap ds-trigger button {
  box-shadow: inset 5px 5px 10px var(--nm-lo), inset -5px -5px 10px var(--nm-hi), 0 0 0 2px var(--nm-accent-glow);
}
.mp-nm-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.mp-nm-vol-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--nm-muted);
  padding: 6px 10px;
  border-radius: 999px;
  box-shadow: inset 3px 3px 6px var(--nm-lo), inset -3px -3px 6px var(--nm-hi);
}
.mp-nm-playlist {
  max-height: 132px;
  overflow-y: auto;
  border-radius: 14px;
  padding: 6px;
  box-shadow: inset 4px 4px 9px var(--nm-lo), inset -4px -4px 9px var(--nm-hi);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mp-nm-track {
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--nm-muted);
}
.mp-nm-track:hover {
  color: var(--nm-text);
}
.mp-nm-track.--active {
  color: var(--nm-accent);
  font-weight: 700;
  box-shadow: 3px 3px 7px var(--nm-lo), -3px -3px 7px var(--nm-hi);
}
.mp-desktop-frameless .mp-nm-deck {
  box-shadow: none;
}
`;
function nmFormatTime(sec) {
    const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
    const mins = Math.floor(safe / 60);
    const rem = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}
function nmTrigger(target, action, label, text) {
    const trig = document.createElement('ds-trigger');
    trig.setAttribute('target', target);
    trig.setAttribute('action', action);
    trig.setAttribute('label', label);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    trig.append(btn);
    return trig;
}
function nmIsDesktop() {
    return typeof globalThis !== 'undefined' && Boolean(globalThis.__TAURI_INTERNALS__);
}
function applyNeumorphTheme(playerTarget, themeKey) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(playerTarget);
    if (el && typeof el.getPluginHost === 'function') {
        void el.getPluginHost().then((host)=>host.setActiveTheme(themeKey));
    }
}
function resetToMinimalTheme(playerTarget) {
    applyNeumorphTheme(playerTarget, null);
}
function mountNeumorphLayout(ctx, container, playerTarget, initialMode, onModeChange) {
    let mode = initialMode;
    const deck = document.createElement('div');
    deck.className = 'mp-nm-deck';
    deck.dataset.nmMode = mode;
    const head = document.createElement('div');
    head.className = 'mp-nm-head';
    head.setAttribute('data-tauri-drag-region', '');
    const brand = document.createElement('div');
    brand.className = 'mp-nm-brand';
    brand.setAttribute('data-tauri-drag-region', '');
    const dot = document.createElement('span');
    dot.className = 'mp-nm-dot';
    const brandLabel = document.createElement('span');
    brandLabel.textContent = 'mPlay3r · Soft Studio';
    brandLabel.setAttribute('data-tauri-drag-region', '');
    brand.append(dot, brandLabel);
    const actions = document.createElement('div');
    actions.className = 'mp-nm-head-actions';
    const modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = 'mp-nm-pill';
    modeBtn.textContent = mode === 'dark' ? '☀ Light' : '☾ Dark';
    modeBtn.addEventListener('click', ()=>{
        mode = mode === 'dark' ? 'light' : 'dark';
        deck.dataset.nmMode = mode;
        modeBtn.textContent = mode === 'dark' ? '☀ Light' : '☾ Dark';
        onModeChange(mode);
    });
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'mp-nm-pill';
    backBtn.textContent = 'Minimal';
    backBtn.addEventListener('click', ()=>resetToMinimalTheme(playerTarget));
    actions.append(modeBtn, backBtn);
    if (nmIsDesktop()) {
        actions.append(nmTrigger(playerTarget, 'toggleAlwaysOnTop', 'Pin window on top', '📌'), nmTrigger(playerTarget, 'minimizeWindow', 'Minimize window', '—'), nmTrigger(playerTarget, 'closeWindow', 'Close window', '×'));
    }
    head.append(brand, actions);
    const well = document.createElement('div');
    well.className = 'mp-nm-well';
    const wellTop = document.createElement('div');
    wellTop.className = 'mp-nm-well-top';
    const titleEl = document.createElement('div');
    titleEl.className = 'mp-nm-title';
    const clockEl = document.createElement('div');
    clockEl.className = 'mp-nm-clock';
    wellTop.append(titleEl, clockEl);
    const subEl = document.createElement('div');
    subEl.className = 'mp-nm-sub';
    const trough = document.createElement('div');
    trough.className = 'mp-nm-trough';
    const seekInput = document.createElement('input');
    seekInput.type = 'range';
    seekInput.min = '0';
    seekInput.max = '100';
    seekInput.step = '0.5';
    seekInput.className = 'mp-nm-range';
    seekInput.setAttribute('aria-label', 'Seek position');
    seekInput.addEventListener('input', ()=>{
        const dur = ctx.getState().duration;
        if (dur > 0) {
            void ctx.playback.seek(Number(seekInput.value) / 100 * dur);
        }
    });
    trough.append(seekInput);
    well.append(wellTop, subEl, trough);
    const transport = document.createElement('div');
    transport.className = 'mp-nm-transport';
    const playWrap = document.createElement('div');
    playWrap.className = 'mp-nm-play-wrap';
    const playTrig = nmTrigger(playerTarget, 'togglePlay', 'Play or pause', '▶');
    playWrap.append(playTrig);
    transport.append(nmTrigger(playerTarget, 'previous', 'Previous track', '⏮'), playWrap, nmTrigger(playerTarget, 'stop', 'Stop playback', '⏹'), nmTrigger(playerTarget, 'next', 'Next track', '⏭'), nmTrigger(playerTarget, 'openFilePicker', 'Open audio files', '⏏'));
    const foot = document.createElement('div');
    foot.className = 'mp-nm-foot';
    const volBox = document.createElement('div');
    volBox.className = 'mp-nm-vol-box';
    const volTag = document.createElement('span');
    volTag.textContent = 'VOL';
    const volInput = document.createElement('input');
    volInput.type = 'range';
    volInput.min = '0';
    volInput.max = '1';
    volInput.step = '0.01';
    volInput.className = 'mp-nm-range';
    volInput.setAttribute('aria-label', 'Volume');
    volInput.addEventListener('input', ()=>{
        void ctx.playback.setVolume(Number(volInput.value));
    });
    volBox.append(volTag, volInput);
    foot.append(volBox, nmTrigger(playerTarget, 'toggleShuffle', 'Toggle shuffle', 'SHF'), nmTrigger(playerTarget, 'cycleRepeat', 'Cycle repeat', 'REP'));
    const playlistEl = document.createElement('div');
    playlistEl.className = 'mp-nm-playlist';
    deck.append(head, well, transport, foot, playlistEl);
    container.innerHTML = '';
    container.append(deck);
    const sync = (snap)=>{
        deck.dataset.nmStatus = snap.status;
        titleEl.textContent = snap.currentTrack?.title || 'Drop audio files or click ⏏';
        subEl.textContent = [
            snap.currentTrack?.artist || 'Soft Studio',
            snap.currentTrack?.album,
            snap.status.toUpperCase()
        ].filter(Boolean).join(' · ');
        clockEl.textContent = nmFormatTime(snap.currentTime);
        seekInput.value = snap.duration > 0 ? String(snap.currentTime / snap.duration * 100) : '0';
        volInput.value = String(snap.volume);
        const playBtn = playTrig.querySelector('button');
        if (playBtn) playBtn.textContent = snap.status === 'playing' ? '⏸' : '▶';
        playlistEl.innerHTML = '';
        if (snap.tracks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'mp-nm-track';
            empty.textContent = 'Playlist empty — add tracks to start listening';
            playlistEl.append(empty);
            return;
        }
        snap.tracks.forEach((tr, idx)=>{
            const row = document.createElement('div');
            row.className = idx === snap.currentIndex ? 'mp-nm-track --active' : 'mp-nm-track';
            const name = document.createElement('span');
            name.textContent = `${idx + 1}. ${tr.artist ? `${tr.artist} — ` : ''}${tr.title}`;
            const fmt = document.createElement('span');
            fmt.textContent = tr.duration ? nmFormatTime(tr.duration) : tr.format || '';
            row.append(name, fmt);
            row.addEventListener('click', ()=>{
                const hostEl = document.querySelector(playerTarget);
                void hostEl?.playTrack?.(idx);
            });
            playlistEl.append(row);
        });
    };
    sync(ctx.getState());
    const offState = ctx.on('stateChange', sync);
    const offTime = ctx.on('timeUpdate', ({ currentTime, duration })=>{
        clockEl.textContent = nmFormatTime(currentTime);
        seekInput.value = duration > 0 ? String(currentTime / duration * 100) : '0';
    });
    const offTrack = ctx.on('trackChange', ()=>sync(ctx.getState()));
    return ()=>{
        offState();
        offTime();
        offTrack();
        container.innerHTML = '';
    };
}

const NEUMORPH_MODE_KEY = 'neumorphMode';
export const manifest = {
    id: 'mplay3r.theme-neumorph',
    name: 'Neumorphism Soft Studio Theme',
    version: '1.0.0',
    description: 'Tactile soft-UI neumorphic structural theme with sculpted dual-shadow controls, concave LCD cavity, Porcelain Light / Graphite Dark toggle, <ds-trigger> controls, and frameless desktop drag support.',
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
        const saved = await ctx.storage.get(NEUMORPH_MODE_KEY);
        let currentMode = saved === 'dark' ? 'dark' : 'light';
        ctx.registerTheme({
            id: NEUMORPH_THEME_ID,
            name: 'Soft Studio Neumorphism',
            css: NEUMORPH_CSS,
            mountLayout: (container, target)=>mountNeumorphLayout(ctx, container, target, currentMode, (nextMode)=>{
                    currentMode = nextMode;
                    void ctx.storage.set(NEUMORPH_MODE_KEY, nextMode);
                })
        });
        ctx.registerSlot({
            id: 'neumorph-panel',
            slot: 'panel',
            title: 'Neumorphism',
            mount (container) {
                container.innerHTML = '';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
                const info = document.createElement('span');
                info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
                info.textContent = 'Soft Studio Neumorphism (Porcelain Light / Graphite Dark)';
                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:0.4rem';
                const applyBtn = document.createElement('button');
                applyBtn.type = 'button';
                applyBtn.textContent = 'Apply Neumorphism';
                applyBtn.style.cssText = 'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.74rem;font-weight:700;cursor:pointer';
                applyBtn.addEventListener('click', ()=>applyNeumorphTheme(ctx.playerTarget, NEUMORPH_THEME_KEY));
                const minBtn = document.createElement('button');
                minBtn.type = 'button';
                minBtn.textContent = 'Minimal';
                minBtn.style.cssText = 'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
                minBtn.addEventListener('click', ()=>resetToMinimalTheme(ctx.playerTarget));
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
