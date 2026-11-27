import type { PlayerSnapshot, PluginContext, PluginDisposer } from '../../../sdk/types';

export const SEVENTIES_THEME_ID = 'seventies-hifi';
export const SEVENTIES_THEME_KEY = 'mplay3r.theme-seventies:seventies-hifi';

export const SEVENTIES_CSS = `
.mp-70-chassis {
  font-family: Georgia, 'Times New Roman', serif;
  display: grid;
  grid-template-columns: 16px 1fr 16px;
  border-radius: 10px;
  overflow: hidden;
  max-width: 520px;
  user-select: none;
  box-shadow: 0 14px 34px rgba(24, 14, 6, 0.55);
  border: 1px solid #3c2210;
}
.mp-70-wood {
  background:
    repeating-linear-gradient(
      88deg,
      rgba(35, 16, 6, 0.28) 0px,
      rgba(35, 16, 6, 0.28) 2px,
      transparent 2px,
      transparent 6px
    ),
    linear-gradient(180deg, #6e3c1b 0%, #4e2810 48%, #3a1c0a 100%);
  box-shadow: inset 1px 0 0 rgba(255, 210, 160, 0.2), inset -1px 0 0 rgba(0, 0, 0, 0.55);
}
.mp-70-face {
  background:
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.08) 0px,
      rgba(255, 255, 255, 0.08) 1px,
      transparent 1px,
      transparent 3px
    ),
    linear-gradient(180deg, #e5dfd1 0%, #cfc7b4 52%, #b9b09b 100%);
  color: #2b2117;
  padding: 12px 14px;
}
.mp-70-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 2px solid #8a7f6c;
  cursor: grab;
}
.mp-70-badge {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.mp-70-logo {
  font-size: 16px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: 0.04em;
  color: #2b1a0d;
}
.mp-70-model {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6b4e2e;
}
.mp-70-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}
.mp-70-glass {
  background: linear-gradient(180deg, #131c1e 0%, #0b1214 100%);
  border: 3px solid #6b6355;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  box-shadow: inset 0 4px 14px rgba(0, 0, 0, 0.85), 0 1px 0 rgba(255, 255, 255, 0.45);
}
.mp-70-vu-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 8px;
}
.mp-70-vu {
  position: relative;
  height: 52px;
  border-radius: 4px;
  background: radial-gradient(ellipse at 50% 105%, #ffe59e 0%, #f5b841 55%, #b36b17 100%);
  border: 2px solid #2b261e;
  overflow: hidden;
  box-shadow: inset 0 2px 8px rgba(40, 20, 0, 0.55);
}
.mp-70-vu-scale {
  position: absolute;
  inset: 4px 6px auto 6px;
  display: flex;
  justify-content: space-between;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 8px;
  font-weight: 700;
  color: #311d08;
}
.mp-70-vu-scale span:last-child {
  color: #b91c1c;
}
.mp-70-vu-label {
  position: absolute;
  left: 50%;
  top: 17px;
  transform: translateX(-50%);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-weight: 700;
  color: #45270b;
  letter-spacing: 0.08em;
}
.mp-70-needle {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 2px;
  height: 46px;
  background: #1f140a;
  transform-origin: bottom center;
  transform: translateX(-50%) rotate(-44deg);
  transition: transform 70ms linear;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.45);
}
.mp-70-dial-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.mp-70-track {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #4ee1c8;
  text-shadow: 0 0 8px rgba(78, 225, 200, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-70-clock {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #ff9d3b;
  text-shadow: 0 0 8px rgba(255, 157, 59, 0.55);
  flex-shrink: 0;
}
.mp-70-dial-rail {
  margin-top: 7px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  color: #93c5ba;
}
.mp-70-face input[type="range"] {
  accent-color: #d95d22;
  cursor: pointer;
}
.mp-70-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.mp-70-switches {
  display: flex;
  align-items: center;
  gap: 5px;
}
.mp-70-btn,
.mp-70-chassis ds-trigger button {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 9px;
  border-radius: 4px;
  color: #24190e;
  background: linear-gradient(180deg, #f3efe4 0%, #cfc6b2 55%, #b5ab96 100%);
  border: 1px solid #6e6454;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 2px 3px rgba(40, 26, 12, 0.28);
  cursor: pointer;
}
.mp-70-btn:active,
.mp-70-chassis ds-trigger button:active {
  background: linear-gradient(180deg, #bfb5a0 0%, #ded7c6 100%);
  transform: translateY(1px);
}
.mp-70-led {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #522012;
  border: 1px solid #35140a;
}
.mp-70-chassis[data-70-status="playing"] .mp-70-led {
  background: #ff6b2b;
  box-shadow: 0 0 8px #ff6b2b;
}
.mp-70-vol {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  color: #463726;
}
.mp-70-playlist {
  background: #23170d;
  color: #f0d7a7;
  border: 2px solid #57361c;
  border-radius: 5px;
  padding: 5px 6px;
  max-height: 108px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.mp-70-row {
  padding: 3px 6px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.mp-70-row:hover {
  background: rgba(255, 168, 76, 0.14);
}
.mp-70-row.--active {
  background: #c85219;
  color: #fff8eb;
  font-weight: 700;
}
.mp-desktop-frameless .mp-70-chassis {
  box-shadow: none;
}
`;

/** Maps normalized audio RMS energy [0..1] to analog VU needle angle in degrees [-44°..+42°]. */
export function computeVuNeedleAngle(normalizedEnergy: number): number {
  const clamped = Number.isFinite(normalizedEnergy) ? Math.max(0, Math.min(1, normalizedEnergy)) : 0;
  return -44 + Math.round(clamped * 86);
}

function s70FormatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function s70Trigger(target: string, action: string, label: string, text: string): HTMLElement {
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

function s70IsDesktop(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function applySeventiesTheme(playerTarget: string, themeKey: string | null): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(playerTarget) as
    | (HTMLElement & { getPluginHost?: () => Promise<{ setActiveTheme(key: string | null): void }> })
    | null;
  if (el && typeof el.getPluginHost === 'function') {
    void el.getPluginHost().then(host => host.setActiveTheme(themeKey));
  }
}

export function mountSeventiesLayout(
  ctx: PluginContext,
  container: HTMLElement,
  playerTarget: string,
): PluginDisposer {
  const chassis = document.createElement('div');
  chassis.className = 'mp-70-chassis';

  const leftWood = document.createElement('div');
  leftWood.className = 'mp-70-wood';
  const rightWood = document.createElement('div');
  rightWood.className = 'mp-70-wood';

  const face = document.createElement('div');
  face.className = 'mp-70-face';

  const top = document.createElement('div');
  top.className = 'mp-70-top';
  top.setAttribute('data-tauri-drag-region', '');

  const badge = document.createElement('div');
  badge.className = 'mp-70-badge';
  badge.setAttribute('data-tauri-drag-region', '');
  const led = document.createElement('span');
  led.className = 'mp-70-led';
  const logo = document.createElement('span');
  logo.className = 'mp-70-logo';
  logo.textContent = 'mPlay3r';
  logo.setAttribute('data-tauri-drag-region', '');
  const model = document.createElement('span');
  model.className = 'mp-70-model';
  model.textContent = 'STEREO M-74';
  model.setAttribute('data-tauri-drag-region', '');
  badge.append(led, logo, model);

  const actions = document.createElement('div');
  actions.className = 'mp-70-actions';
  const minBtn = document.createElement('button');
  minBtn.type = 'button';
  minBtn.className = 'mp-70-btn';
  minBtn.textContent = 'Minimal';
  minBtn.addEventListener('click', () => applySeventiesTheme(playerTarget, null));
  actions.append(minBtn);
  if (s70IsDesktop()) {
    actions.append(
      s70Trigger(playerTarget, 'toggleAlwaysOnTop', 'Pin window on top', '📌'),
      s70Trigger(playerTarget, 'minimizeWindow', 'Minimize window', '—'),
      s70Trigger(playerTarget, 'closeWindow', 'Close window', '×'),
    );
  }
  top.append(badge, actions);

  // Glowing vintage glass faceplate with dual analog VU meters
  const glass = document.createElement('div');
  glass.className = 'mp-70-glass';

  const makeVu = (channel: string) => {
    const vu = document.createElement('div');
    vu.className = 'mp-70-vu';
    const scale = document.createElement('div');
    scale.className = 'mp-70-vu-scale';
    for (const mark of ['-20', '-7', '-3', '0', '+3']) {
      const sp = document.createElement('span');
      sp.textContent = mark;
      scale.append(sp);
    }
    const lbl = document.createElement('div');
    lbl.className = 'mp-70-vu-label';
    lbl.textContent = `VU · ${channel}`;
    const needle = document.createElement('div');
    needle.className = 'mp-70-needle';
    vu.append(scale, lbl, needle);
    return { vu, needle };
  };

  const vuRow = document.createElement('div');
  vuRow.className = 'mp-70-vu-row';
  const vuLeft = makeVu('L');
  const vuRight = makeVu('R');
  vuRow.append(vuLeft.vu, vuRight.vu);

  const dialInfo = document.createElement('div');
  dialInfo.className = 'mp-70-dial-info';
  const trackEl = document.createElement('div');
  trackEl.className = 'mp-70-track';
  const clockEl = document.createElement('div');
  clockEl.className = 'mp-70-clock';
  dialInfo.append(trackEl, clockEl);

  const dialRail = document.createElement('div');
  dialRail.className = 'mp-70-dial-rail';
  const dialTag = document.createElement('span');
  dialTag.textContent = 'TUNING';
  const seekInput = document.createElement('input');
  seekInput.type = 'range';
  seekInput.min = '0';
  seekInput.max = '100';
  seekInput.step = '0.5';
  seekInput.style.flex = '1';
  seekInput.setAttribute('aria-label', 'Track position');
  seekInput.addEventListener('input', () => {
    const dur = ctx.getState().duration;
    if (dur > 0) void ctx.playback.seek((Number(seekInput.value) / 100) * dur);
  });
  dialRail.append(dialTag, seekInput);

  glass.append(vuRow, dialInfo, dialRail);

  // Tactile metallic switch row
  const controls = document.createElement('div');
  controls.className = 'mp-70-controls';

  const switches = document.createElement('div');
  switches.className = 'mp-70-switches';
  const playTrig = s70Trigger(playerTarget, 'togglePlay', 'Play or pause', '▶ PLAY');
  switches.append(
    s70Trigger(playerTarget, 'previous', 'Previous track', '⏮'),
    playTrig,
    s70Trigger(playerTarget, 'stop', 'Stop', '⏹'),
    s70Trigger(playerTarget, 'next', 'Next track', '⏭'),
    s70Trigger(playerTarget, 'toggleShuffle', 'Toggle shuffle', 'SHF'),
    s70Trigger(playerTarget, 'cycleRepeat', 'Cycle repeat', 'REP'),
    s70Trigger(playerTarget, 'openFilePicker', 'Load tracks', '⏏'),
  );

  const volWrap = document.createElement('div');
  volWrap.className = 'mp-70-vol';
  const volLbl = document.createElement('span');
  volLbl.textContent = 'GAIN';
  const volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.min = '0';
  volInput.max = '1';
  volInput.step = '0.01';
  volInput.style.width = '78px';
  volInput.setAttribute('aria-label', 'Volume');
  volInput.addEventListener('input', () => {
    void ctx.playback.setVolume(Number(volInput.value));
  });
  volWrap.append(volLbl, volInput);
  controls.append(switches, volWrap);

  const playlistEl = document.createElement('div');
  playlistEl.className = 'mp-70-playlist';

  face.append(top, glass, controls, playlistEl);
  chassis.append(leftWood, face, rightWood);
  container.innerHTML = '';
  container.append(chassis);

  let disposed = false;
  let rafId = 0;
  let smoothL = 0;
  let smoothR = 0;
  let analyserRef: AnalyserNode | null = null;
  let freqData: Uint8Array<ArrayBuffer> | null = null;

  const ensureAnalyser = () => {
    if (analyserRef || disposed) return;
    void ctx.getAudioAnalyser().then(node => {
      if (!disposed && node) {
        analyserRef = node;
        freqData = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
      }
    });
  };

  const animateVu = () => {
    if (disposed) return;
    const isPlaying = ctx.getState().status === 'playing';
    let targetL = 0;
    let targetR = 0;
    if (isPlaying) {
      if (analyserRef && freqData) {
        analyserRef.getByteFrequencyData(freqData);
        let lowSum = 0;
        let hiSum = 0;
        const half = Math.max(1, Math.min(32, freqData.length >> 1));
        for (let i = 0; i < half; i += 1) {
          lowSum += freqData[i];
          hiSum += freqData[half + i] ?? freqData[i];
        }
        targetL = Math.min(1, lowSum / (half * 210));
        targetR = Math.min(1, hiSum / (half * 210));
      } else {
        const t = Date.now() / 180;
        targetL = 0.42 + 0.28 * Math.abs(Math.sin(t));
        targetR = 0.38 + 0.31 * Math.abs(Math.cos(t * 1.17));
        ensureAnalyser();
      }
    }
    smoothL = smoothL * 0.72 + targetL * 0.28;
    smoothR = smoothR * 0.72 + targetR * 0.28;
    vuLeft.needle.style.transform = `translateX(-50%) rotate(${computeVuNeedleAngle(smoothL)}deg)`;
    vuRight.needle.style.transform = `translateX(-50%) rotate(${computeVuNeedleAngle(smoothR)}deg)`;

    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(animateVu);
    }
  };

  const sync = (snap: PlayerSnapshot) => {
    chassis.dataset['70Status'] = snap.status;
    trackEl.textContent = snap.currentTrack
      ? `${snap.currentTrack.artist ? `${snap.currentTrack.artist} — ` : ''}${snap.currentTrack.title}`
      : 'FM STEREO · READY — LOAD VINYL / FILES';
    clockEl.textContent = s70FormatTime(snap.currentTime);
    seekInput.value = snap.duration > 0 ? String((snap.currentTime / snap.duration) * 100) : '0';
    volInput.value = String(snap.volume);
    const playBtn = playTrig.querySelector('button');
    if (playBtn) playBtn.textContent = snap.status === 'playing' ? '⏸ PAUSE' : '▶ PLAY';
    if (snap.status === 'playing') ensureAnalyser();

    playlistEl.innerHTML = '';
    if (snap.tracks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mp-70-row';
      empty.textContent = 'SIDE A · No tracks queued yet';
      playlistEl.append(empty);
      return;
    }
    snap.tracks.forEach((tr, idx) => {
      const row = document.createElement('div');
      row.className = idx === snap.currentIndex ? 'mp-70-row --active' : 'mp-70-row';
      const title = document.createElement('span');
      title.textContent = `A${idx + 1} · ${tr.artist ? `${tr.artist} — ` : ''}${tr.title}`;
      const dur = document.createElement('span');
      dur.textContent = tr.duration ? s70FormatTime(tr.duration) : tr.format || '';
      row.append(title, dur);
      row.addEventListener('click', () => {
        const hostEl = document.querySelector(playerTarget) as (HTMLElement & { playTrack?: (i: number) => Promise<void> }) | null;
        void hostEl?.playTrack?.(idx);
      });
      playlistEl.append(row);
    });
  };

  sync(ctx.getState());
  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(animateVu);
  }
  const offState = ctx.on('stateChange', sync);
  const offTime = ctx.on('timeUpdate', ({ currentTime, duration }) => {
    clockEl.textContent = s70FormatTime(currentTime);
    seekInput.value = duration > 0 ? String((currentTime / duration) * 100) : '0';
  });
  const offTrack = ctx.on('trackChange', () => sync(ctx.getState()));

  return () => {
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
