// mPlay3r addon bundle: mplay3r.theme-cyberpunk-jukebox@1.0.0 (generated from plugins/theme-cyberpunk-jukebox/src)

const CYBERPUNK_THEME_ID = 'cyberpunk-jukebox';
const CYBERPUNK_THEME_KEY = 'mplay3r.theme-cyberpunk-jukebox:cyberpunk-jukebox';
const CYBERPUNK_CSS = `
@keyframes mp-cp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes mp-cp-neon-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(255, 0, 170, 0.65), 0 0 26px rgba(0, 240, 255, 0.35), inset 0 0 18px rgba(255, 0, 170, 0.35); }
  50% { box-shadow: 0 0 18px rgba(0, 240, 255, 0.8), 0 0 36px rgba(255, 0, 170, 0.5), inset 0 0 24px rgba(0, 240, 255, 0.35); }
}
.mp-cp-jukebox {
  position: relative;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #e6f9ff;
  max-width: 526px;
  user-select: none;
  padding: 26px 8px 8px 8px;
}
.mp-cp-arch {
  position: relative;
  height: 36px;
  margin: 0 26px -14px 26px;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(90deg, #ff00aa 0%, #7c3aed 48%, #00f0ff 100%);
  padding: 3px 3px 0 3px;
  animation: mp-cp-neon-pulse 3.2s ease-in-out infinite;
  cursor: grab;
}
.mp-cp-arch-inner {
  height: 100%;
  border-radius: 999px 999px 0 0;
  background: radial-gradient(ellipse at 50% 100%, #1a0b2e 0%, #070611 75%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.24em;
  color: #00f0ff;
  text-shadow: 0 0 8px #00f0ff, 0 0 14px #ff00aa;
}
.mp-cp-body {
  position: relative;
  background:
    repeating-linear-gradient(
      0deg,
      rgba(0, 240, 255, 0.03) 0px,
      rgba(0, 240, 255, 0.03) 1px,
      transparent 1px,
      transparent 3px
    ),
    linear-gradient(160deg, #0d0a1f 0%, #080917 55%, #120822 100%);
  border: 2px solid #00f0ff;
  border-radius: 14px 14px 18px 18px;
  padding: 14px;
  box-shadow:
    0 0 0 1px rgba(255, 0, 170, 0.55),
    0 0 22px rgba(0, 240, 255, 0.28),
    0 14px 32px rgba(0, 0, 0, 0.72);
  overflow: hidden;
}
.mp-desktop-frameless .mp-cp-body {
  box-shadow:
    0 0 0 1px rgba(255, 0, 170, 0.65),
    0 0 10px rgba(0, 240, 255, 0.42);
}
.mp-cp-body::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(255, 0, 170, 0.08), transparent 16%, transparent 84%, rgba(0, 240, 255, 0.08));
}
.mp-cp-hud {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(0, 240, 255, 0.28);
  cursor: grab;
}
.mp-cp-hud-tag {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: #ff2ebd;
  text-shadow: 0 0 8px rgba(255, 46, 189, 0.7);
}
.mp-cp-hud-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}
.mp-cp-stage {
  position: relative;
  display: grid;
  grid-template-columns: 106px 1fr;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.mp-cp-bay {
  position: relative;
  width: 106px;
  height: 106px;
  border-radius: 50%;
  padding: 6px;
  background: radial-gradient(circle, #1e0b36 0%, #05050d 75%);
  border: 2px solid #ff2ebd;
  box-shadow: 0 0 16px rgba(255, 46, 189, 0.5), inset 0 0 14px rgba(0, 240, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-cp-laser {
  position: absolute;
  right: 8px;
  top: 12px;
  width: 3px;
  height: 44px;
  border-radius: 999px;
  background: linear-gradient(180deg, #94a3b8 0%, #ff2ebd 100%);
  transform-origin: top center;
  transform: rotate(-16deg);
  transition: transform 240ms ease, box-shadow 240ms ease;
  pointer-events: none;
}
.mp-cp-jukebox[data-cp-status="playing"] .mp-cp-laser {
  transform: rotate(24deg);
  box-shadow: 0 0 10px #ff2ebd, 0 0 16px #00f0ff;
}
.mp-cp-disc {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #080917 0 13px, #00f0ff 13px 16px, transparent 16px),
    repeating-radial-gradient(circle at center, rgba(0, 240, 255, 0.22) 0 1px, rgba(16, 10, 34, 0.92) 2px 5px),
    conic-gradient(from 0deg, #ff00aa, #00f0ff, #7c3aed, #facc15, #ff00aa);
  animation: mp-cp-spin 4.2s linear infinite;
  animation-play-state: paused;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
}
.mp-cp-jukebox[data-cp-status="playing"] .mp-cp-disc {
  animation-play-state: running;
}
.mp-cp-screen {
  background: rgba(4, 7, 18, 0.92);
  border: 1px solid rgba(0, 240, 255, 0.5);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: inset 0 0 16px rgba(0, 240, 255, 0.14);
  min-width: 0;
}
.mp-cp-marquee-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.mp-cp-title {
  font-size: 13px;
  font-weight: 800;
  color: #00f0ff;
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.65);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-cp-clock {
  font-size: 13px;
  font-weight: 800;
  color: #facc15;
  text-shadow: 0 0 8px rgba(250, 204, 21, 0.65);
  flex-shrink: 0;
}
.mp-cp-canvas {
  display: block;
  width: 100%;
  height: 54px;
  border-radius: 4px;
  background: #04050d;
  border: 1px solid rgba(255, 46, 189, 0.35);
}
.mp-cp-scrub {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 9px;
  color: #93c5fd;
}
.mp-cp-jukebox input[type="range"] {
  accent-color: #ff2ebd;
  cursor: pointer;
}
.mp-cp-controls {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.mp-cp-btn-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.mp-cp-btn,
.mp-cp-jukebox ds-trigger button {
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 5px 9px;
  border-radius: 5px;
  background: linear-gradient(180deg, #1b1138 0%, #0d0a21 100%);
  color: #00f0ff;
  border: 1px solid #00f0ff;
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.25);
  cursor: pointer;
  transition: box-shadow 120ms ease, color 120ms ease, border-color 120ms ease;
}
.mp-cp-btn:hover,
.mp-cp-jukebox ds-trigger button:hover {
  color: #ff2ebd;
  border-color: #ff2ebd;
  box-shadow: 0 0 12px rgba(255, 46, 189, 0.55);
}
.mp-cp-play-btn ds-trigger button {
  color: #090614;
  background: linear-gradient(90deg, #00f0ff, #ff2ebd);
  border-color: #ffffff;
  box-shadow: 0 0 14px rgba(255, 46, 189, 0.65);
}
.mp-cp-vol {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #ff79d1;
}
.mp-cp-selector-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  max-height: 118px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 8px;
  background: rgba(4, 6, 16, 0.88);
  border: 1px solid rgba(255, 46, 189, 0.4);
}
.mp-cp-slot {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  border-radius: 5px;
  border: 1px solid rgba(0, 240, 255, 0.28);
  background: rgba(16, 12, 38, 0.85);
  color: #cbd5e1;
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}
.mp-cp-slot:hover {
  border-color: #00f0ff;
  color: #ffffff;
}
.mp-cp-slot.--active {
  border-color: #ff2ebd;
  background: linear-gradient(90deg, rgba(255, 0, 170, 0.28), rgba(0, 240, 255, 0.2));
  color: #ffffff;
  box-shadow: 0 0 12px rgba(255, 0, 170, 0.45);
}
.mp-cp-code {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 3px;
  background: #00f0ff;
  color: #060814;
  font-size: 10px;
  font-weight: 900;
}
.mp-cp-slot.--active .mp-cp-code {
  background: #facc15;
  color: #060814;
}
.mp-cp-slot-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
function formatJukeboxCode(index) {
    const safe = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
    const bankIdx = Math.floor(safe / 9);
    const slotNum = safe % 9 + 1;
    const bankChar = String.fromCharCode(65 + bankIdx % 26);
    return `${bankChar}${slotNum}`;
}
function cpFormatTime(sec) {
    const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
function cpTrigger(target, action, label, text) {
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
function cpIsDesktop() {
    return typeof globalThis !== 'undefined' && Boolean(globalThis.__TAURI_INTERNALS__);
}
function applyCyberpunkTheme(playerTarget, themeKey) {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(playerTarget);
    if (el && typeof el.getPluginHost === 'function') {
        void el.getPluginHost().then((host)=>host.setActiveTheme(themeKey));
    }
}
function mountCyberpunkJukeboxLayout(ctx, container, playerTarget) {
    const root = document.createElement('div');
    root.className = 'mp-cp-jukebox';
    const arch = document.createElement('div');
    arch.className = 'mp-cp-arch';
    arch.setAttribute('data-tauri-drag-region', '');
    const archInner = document.createElement('div');
    archInner.className = 'mp-cp-arch-inner';
    archInner.textContent = '★ CYBER-JUKEBOX 2099 ★';
    archInner.setAttribute('data-tauri-drag-region', '');
    arch.append(archInner);
    const body = document.createElement('div');
    body.className = 'mp-cp-body';
    const hud = document.createElement('div');
    hud.className = 'mp-cp-hud';
    hud.setAttribute('data-tauri-drag-region', '');
    const hudTag = document.createElement('span');
    hudTag.className = 'mp-cp-hud-tag';
    hudTag.textContent = 'MPLAY3R // NEON DECK';
    hudTag.setAttribute('data-tauri-drag-region', '');
    const hudActions = document.createElement('div');
    hudActions.className = 'mp-cp-hud-actions';
    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'mp-cp-btn';
    minBtn.textContent = 'MINIMAL';
    minBtn.addEventListener('click', ()=>applyCyberpunkTheme(playerTarget, null));
    hudActions.append(minBtn);
    if (cpIsDesktop()) {
        hudActions.append(cpTrigger(playerTarget, 'toggleAlwaysOnTop', 'Pin window on top', '📌'), cpTrigger(playerTarget, 'minimizeWindow', 'Minimize window', '—'), cpTrigger(playerTarget, 'closeWindow', 'Close window', '×'));
    }
    hud.append(hudTag, hudActions);
    const stage = document.createElement('div');
    stage.className = 'mp-cp-stage';
    const bay = document.createElement('div');
    bay.className = 'mp-cp-bay';
    const disc = document.createElement('div');
    disc.className = 'mp-cp-disc';
    const laser = document.createElement('div');
    laser.className = 'mp-cp-laser';
    bay.append(disc, laser);
    const screen = document.createElement('div');
    screen.className = 'mp-cp-screen';
    const marqueeRow = document.createElement('div');
    marqueeRow.className = 'mp-cp-marquee-row';
    const titleEl = document.createElement('div');
    titleEl.className = 'mp-cp-title';
    const clockEl = document.createElement('div');
    clockEl.className = 'mp-cp-clock';
    marqueeRow.append(titleEl, clockEl);
    const canvas = document.createElement('canvas');
    canvas.className = 'mp-cp-canvas';
    canvas.width = 320;
    canvas.height = 54;
    const scrub = document.createElement('div');
    scrub.className = 'mp-cp-scrub';
    const scrubTag = document.createElement('span');
    scrubTag.textContent = 'SYNC';
    const seekInput = document.createElement('input');
    seekInput.type = 'range';
    seekInput.min = '0';
    seekInput.max = '100';
    seekInput.step = '0.5';
    seekInput.style.flex = '1';
    seekInput.setAttribute('aria-label', 'Seek');
    seekInput.addEventListener('input', ()=>{
        const dur = ctx.getState().duration;
        if (dur > 0) void ctx.playback.seek(Number(seekInput.value) / 100 * dur);
    });
    scrub.append(scrubTag, seekInput);
    screen.append(marqueeRow, canvas, scrub);
    stage.append(bay, screen);
    const controls = document.createElement('div');
    controls.className = 'mp-cp-controls';
    const btnRow = document.createElement('div');
    btnRow.className = 'mp-cp-btn-row';
    const playWrap = document.createElement('span');
    playWrap.className = 'mp-cp-play-btn';
    const playTrig = cpTrigger(playerTarget, 'togglePlay', 'Play or pause', '▶ ENGAGE');
    playWrap.append(playTrig);
    btnRow.append(cpTrigger(playerTarget, 'previous', 'Previous', '«'), playWrap, cpTrigger(playerTarget, 'stop', 'Stop', '■'), cpTrigger(playerTarget, 'next', 'Next', '»'), cpTrigger(playerTarget, 'toggleShuffle', 'Shuffle', 'SHF'), cpTrigger(playerTarget, 'cycleRepeat', 'Repeat', 'REP'), cpTrigger(playerTarget, 'openFilePicker', 'Insert media', '+ DISC'));
    const volWrap = document.createElement('div');
    volWrap.className = 'mp-cp-vol';
    const volTag = document.createElement('span');
    volTag.textContent = 'AMP';
    const volInput = document.createElement('input');
    volInput.type = 'range';
    volInput.min = '0';
    volInput.max = '1';
    volInput.step = '0.01';
    volInput.style.width = '76px';
    volInput.setAttribute('aria-label', 'Volume');
    volInput.addEventListener('input', ()=>{
        void ctx.playback.setVolume(Number(volInput.value));
    });
    volWrap.append(volTag, volInput);
    controls.append(btnRow, volWrap);
    const grid = document.createElement('div');
    grid.className = 'mp-cp-selector-grid';
    body.append(hud, stage, controls, grid);
    root.append(arch, body);
    container.innerHTML = '';
    container.append(root);
    let disposed = false;
    let rafId = 0;
    let analyserRef = null;
    let freqData = null;
    const ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    const peaks = new Float32Array(20);
    const ensureAnalyser = ()=>{
        if (analyserRef || disposed) return;
        void ctx.getAudioAnalyser().then((node)=>{
            if (!disposed && node) {
                analyserRef = node;
                freqData = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
            }
        });
    };
    const drawNeonSpectrum = ()=>{
        if (disposed) return;
        if (ctx2d) {
            const w = canvas.width;
            const h = canvas.height;
            ctx2d.fillStyle = '#04050d';
            ctx2d.fillRect(0, 0, w, h);
            ctx2d.strokeStyle = 'rgba(0, 240, 255, 0.16)';
            ctx2d.lineWidth = 1;
            for(let y = 14; y < h; y += 14){
                ctx2d.beginPath();
                ctx2d.moveTo(0, y);
                ctx2d.lineTo(w, y);
                ctx2d.stroke();
            }
            const playing = ctx.getState().status === 'playing';
            if (playing && analyserRef && freqData) {
                analyserRef.getByteFrequencyData(freqData);
            } else if (playing) {
                ensureAnalyser();
            }
            const bars = 20;
            const gap = 3;
            const bw = (w - gap * (bars + 1)) / bars;
            const now = Date.now() / 160;
            for(let i = 0; i < bars; i += 1){
                let level = 0.05;
                if (playing) {
                    if (analyserRef && freqData) {
                        const bin = Math.min(freqData.length - 1, Math.floor(Math.pow(freqData.length / 2, i / bars)));
                        level = Math.max(0.06, freqData[bin] / 245);
                    } else {
                        level = 0.22 + 0.55 * Math.abs(Math.sin(now + i * 0.45));
                    }
                }
                peaks[i] = level >= peaks[i] ? level : Math.max(0.04, peaks[i] - 0.025);
                const bh = Math.max(2, level * (h - 8));
                const x = gap + i * (bw + gap);
                ctx2d.fillStyle = i % 2 === 0 ? '#00f0ff' : '#ff2ebd';
                ctx2d.fillRect(x, h - 3 - bh, bw, bh);
                const py = h - 3 - peaks[i] * (h - 8);
                ctx2d.fillStyle = '#facc15';
                ctx2d.fillRect(x, Math.max(2, py - 2), bw, 2);
            }
        }
        if (typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(drawNeonSpectrum);
        }
    };
    const sync = (snap)=>{
        root.dataset.cpStatus = snap.status;
        titleEl.textContent = snap.currentTrack ? `${formatJukeboxCode(Math.max(0, snap.currentIndex))} // ${snap.currentTrack.title}` : 'INSERT AUDIO DISC · READY';
        clockEl.textContent = cpFormatTime(snap.currentTime);
        seekInput.value = snap.duration > 0 ? String(snap.currentTime / snap.duration * 100) : '0';
        volInput.value = String(snap.volume);
        const playBtn = playTrig.querySelector('button');
        if (playBtn) playBtn.textContent = snap.status === 'playing' ? '⏸ HOLD' : '▶ ENGAGE';
        if (snap.status === 'playing') ensureAnalyser();
        grid.innerHTML = '';
        if (snap.tracks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'mp-cp-slot';
            empty.style.gridColumn = '1 / -1';
            empty.textContent = 'A1 // NO DISCS LOADED — CLICK + DISC';
            grid.append(empty);
            return;
        }
        snap.tracks.forEach((tr, idx)=>{
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = idx === snap.currentIndex ? 'mp-cp-slot --active' : 'mp-cp-slot';
            const code = document.createElement('span');
            code.className = 'mp-cp-code';
            code.textContent = formatJukeboxCode(idx);
            const name = document.createElement('span');
            name.className = 'mp-cp-slot-name';
            name.textContent = tr.artist ? `${tr.artist} — ${tr.title}` : tr.title;
            tile.append(code, name);
            tile.addEventListener('click', ()=>{
                const hostEl = document.querySelector(playerTarget);
                void hostEl?.playTrack?.(idx);
            });
            grid.append(tile);
        });
    };
    sync(ctx.getState());
    if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(drawNeonSpectrum);
    }
    const offState = ctx.on('stateChange', sync);
    const offTime = ctx.on('timeUpdate', ({ currentTime, duration })=>{
        clockEl.textContent = cpFormatTime(currentTime);
        seekInput.value = duration > 0 ? String(currentTime / duration * 100) : '0';
    });
    const offTrack = ctx.on('trackChange', ()=>sync(ctx.getState()));
    return ()=>{
        disposed = true;
        if (rafId && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId);
        }
        offState();
        offTime();
        offTrack();
        container.innerHTML = '';
    };
}

export const manifest = {
    id: 'mplay3r.theme-cyberpunk-jukebox',
    name: 'Cyberpunk Neon Jukebox Theme',
    version: '1.0.0',
    description: 'High-impact visual Cyberpunk Jukebox structural theme: glowing cyan/magenta neon arch, spinning holographic cyber-disc platter, live Canvas 2D FFT neon spectrum & CRT scanlines on getAudioAnalyser(), illuminated A1-D4 jukebox track selector grid, and frameless desktop drag support.',
    category: 'theme',
    permissions: [
        'theme',
        'ui-slot',
        'audio-analyser',
        'playback-control'
    ],
    minCoreVersion: '0.1.0',
    author: 'jezoock',
    homepage: 'https://github.com/jezoock/mPlay3r-addons',
    runtime: 'all'
};
export const plugin = {
    manifest,
    async activate (ctx) {
        ctx.registerTheme({
            id: CYBERPUNK_THEME_ID,
            name: 'Cyberpunk Neon Jukebox',
            css: CYBERPUNK_CSS,
            mountLayout: (container, target)=>mountCyberpunkJukeboxLayout(ctx, container, target)
        });
        ctx.registerSlot({
            id: 'cyberpunk-panel',
            slot: 'panel',
            title: 'Cyberpunk Jukebox',
            mount (container) {
                container.innerHTML = '';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap';
                const info = document.createElement('span');
                info.style.cssText = 'font-size:0.78rem;color:var(--mp-text-muted)';
                info.textContent = 'Cyberpunk Neon Jukebox 2099 (Holo-Disc + Live FFT + A1-D4 Grid)';
                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:0.4rem';
                const applyBtn = document.createElement('button');
                applyBtn.type = 'button';
                applyBtn.textContent = 'Engage Jukebox';
                applyBtn.style.cssText = 'padding:0.25rem 0.65rem;border-radius:999px;border:1px solid #00f0ff;background:linear-gradient(90deg,#00f0ff,#ff2ebd);color:#060814;font-size:0.74rem;font-weight:800;cursor:pointer';
                applyBtn.addEventListener('click', ()=>applyCyberpunkTheme(ctx.playerTarget, CYBERPUNK_THEME_KEY));
                const minBtn = document.createElement('button');
                minBtn.type = 'button';
                minBtn.textContent = 'Minimal';
                minBtn.style.cssText = 'padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.74rem;cursor:pointer';
                minBtn.addEventListener('click', ()=>applyCyberpunkTheme(ctx.playerTarget, null));
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
