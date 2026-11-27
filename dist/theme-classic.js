// mPlay3r addon bundle: mplay3r.theme-classic@1.0.0 (generated from plugins/theme-classic/src)

const THEME_PREF_STORAGE_KEY = 'selectedThemeKey';
async function resolveHostThemeAdapter(playerTarget) {
    if (typeof document === 'undefined' || !playerTarget) return null;
    const el = document.querySelector(playerTarget);
    if (!el || typeof el.getPluginHost !== 'function') return null;
    const host = await el.getPluginHost();
    return {
        setActiveTheme: (key)=>host.setActiveTheme(key),
        getActiveThemeKey: ()=>host.getActiveTheme?.()?.key ?? null
    };
}
class ThemeSwitchController {
    storage;
    getAdapter;
    activeKey = null;
    constructor(storage, getAdapter){
        this.storage = storage;
        this.getAdapter = getAdapter;
    }
    getActiveThemeKey() {
        return this.activeKey;
    }
    async load() {
        const saved = await this.storage.get(THEME_PREF_STORAGE_KEY);
        this.activeKey = typeof saved === 'string' && saved.trim() ? saved : null;
        if (this.activeKey) {
            const adapter = await this.getAdapter();
            adapter?.setActiveTheme(this.activeKey);
        }
        return this.activeKey;
    }
    async switchTo(themeKey) {
        const normalized = themeKey && themeKey.trim() ? themeKey.trim() : null;
        this.activeKey = normalized;
        const adapter = await this.getAdapter();
        adapter?.setActiveTheme(normalized);
        await this.storage.set(THEME_PREF_STORAGE_KEY, normalized);
        return normalized;
    }
}

const WINAMP_CLASSIC_CSS = `
.mp-wa-deck {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: linear-gradient(180deg, #323748 0%, #1d202b 100%);
  color: #00ff41;
  border: 2px solid #525972;
  border-right-color: #11131a;
  border-bottom-color: #11131a;
  border-radius: 3px;
  padding: 6px;
  max-width: 360px;
  user-select: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.mp-wa-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, #1b2848, #3d5a99, #1b2848);
  color: #e5ecff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 2px 6px;
  margin-bottom: 6px;
}
.mp-wa-lcd {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 6px;
  background: #070a08;
  border: 2px inset #2b3040;
  padding: 6px;
  margin-bottom: 6px;
}
.mp-wa-clock {
  font-size: 20px;
  font-weight: 700;
  color: #00ff55;
  text-shadow: 0 0 6px rgba(0, 255, 85, 0.45);
  line-height: 1.1;
}
.mp-wa-marquee {
  font-size: 11px;
  color: #4ade80;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-wa-meta {
  font-size: 9px;
  color: #86efac;
  opacity: 0.85;
  margin-top: 2px;
}
.mp-wa-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: wrap;
}
.mp-wa-btn-group {
  display: flex;
  gap: 3px;
  align-items: center;
}
.mp-wa-deck ds-trigger button,
.mp-wa-mini-btn {
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 6px;
  background: linear-gradient(180deg, #4a5068, #2c3040);
  color: #e2e8f0;
  border: 1px solid #6b728e;
  border-right-color: #161822;
  border-bottom-color: #161822;
  cursor: pointer;
}
.mp-wa-deck input[type="range"] {
  accent-color: #22c55e;
  height: 6px;
}
.mp-wa-playlist {
  margin-top: 6px;
  background: #050706;
  border: 2px inset #2b3040;
  max-height: 120px;
  overflow-y: auto;
  padding: 4px;
  font-size: 10px;
}
.mp-wa-pl-item {
  padding: 2px 4px;
  color: #00e640;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-wa-pl-item.--active {
  background: #0000b8;
  color: #ffffff;
}
`;
const HIFI_RACK_CSS = `
.mp-hifi-rack {
  font-family: system-ui, -apple-system, sans-serif;
  background: linear-gradient(180deg, #24262b 0%, #16181c 55%, #111216 100%);
  color: #e5e7eb;
  border: 1px solid #3c4049;
  border-radius: 6px;
  padding: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 26px rgba(0, 0, 0, 0.45);
}
.mp-hifi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid #2e323b;
  padding-bottom: 6px;
}
.mp-hifi-brand {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: #f59e0b;
  text-transform: uppercase;
}
.mp-hifi-vfd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #090d11;
  border: 1px solid #26313d;
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.mp-hifi-vfd-title {
  font-size: 14px;
  font-weight: 600;
  color: #38bdf8;
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.35);
}
.mp-hifi-vfd-sub {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}
.mp-hifi-vfd-time {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 22px;
  font-weight: 700;
  color: #fbbf24;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.35);
}
.mp-hifi-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.mp-hifi-rack ds-trigger button,
.mp-hifi-btn {
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid #404552;
  background: linear-gradient(180deg, #323640, #1f2229);
  color: #f3f4f6;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.mp-hifi-rack input[type="range"] {
  accent-color: #f59e0b;
}
`;
function formatThemeTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function makeDsTrigger(playerTarget, action, label, ariaLabel) {
    const trigger = document.createElement('ds-trigger');
    trigger.setAttribute('target', playerTarget);
    trigger.setAttribute('action', action);
    if (ariaLabel) trigger.setAttribute('label', ariaLabel);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    trigger.append(btn);
    return trigger;
}
function mountWinampClassicLayout(ctx, container, playerTarget, onSwitchTheme) {
    container.innerHTML = '';
    const deck = document.createElement('div');
    deck.className = 'mp-wa-deck';
    deck.setAttribute('role', 'region');
    deck.setAttribute('aria-label', 'mPlay3r Winamp Classic 2.x Theme');
    const titlebar = document.createElement('div');
    titlebar.className = 'mp-wa-titlebar';
    const titleLabel = document.createElement('span');
    titleLabel.textContent = 'MPLAY3R · CLASSIC 2.X';
    const themeBtns = document.createElement('div');
    themeBtns.className = 'mp-wa-btn-group';
    const hifiBtn = document.createElement('button');
    hifiBtn.type = 'button';
    hifiBtn.className = 'mp-wa-mini-btn';
    hifiBtn.textContent = 'Hi-Fi';
    hifiBtn.addEventListener('click', ()=>onSwitchTheme('mplay3r.theme-classic:hifi-rack'));
    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'mp-wa-mini-btn';
    minBtn.textContent = 'Minimal';
    minBtn.addEventListener('click', ()=>onSwitchTheme(null));
    themeBtns.append(hifiBtn, minBtn);
    titlebar.append(titleLabel, themeBtns);
    const lcd = document.createElement('div');
    lcd.className = 'mp-wa-lcd';
    const clockEl = document.createElement('div');
    clockEl.className = 'mp-wa-clock';
    const lcdRight = document.createElement('div');
    lcdRight.style.minWidth = '0';
    const marqueeEl = document.createElement('div');
    marqueeEl.className = 'mp-wa-marquee';
    const metaEl = document.createElement('div');
    metaEl.className = 'mp-wa-meta';
    lcdRight.append(marqueeEl, metaEl);
    lcd.append(clockEl, lcdRight);
    const seekSlider = document.createElement('input');
    seekSlider.type = 'range';
    seekSlider.min = '0';
    seekSlider.max = '100';
    seekSlider.value = '0';
    seekSlider.style.width = '100%';
    seekSlider.setAttribute('aria-label', 'Seek position');
    seekSlider.addEventListener('input', ()=>{
        const dur = ctx.getState().duration;
        if (dur > 0) {
            void ctx.playback.seek(Number(seekSlider.value) / 100 * dur);
        }
    });
    const controls = document.createElement('div');
    controls.className = 'mp-wa-controls';
    const transport = document.createElement('div');
    transport.className = 'mp-wa-btn-group';
    transport.append(makeDsTrigger(playerTarget, 'previous', '⏮', 'Previous track'), makeDsTrigger(playerTarget, 'play', '▶', 'Play'), makeDsTrigger(playerTarget, 'pause', '⏸', 'Pause'), makeDsTrigger(playerTarget, 'stop', '⏹', 'Stop'), makeDsTrigger(playerTarget, 'next', '⏭', 'Next track'), makeDsTrigger(playerTarget, 'openFilePicker', '⏏', 'Open audio files'));
    const extras = document.createElement('div');
    extras.className = 'mp-wa-btn-group';
    extras.append(makeDsTrigger(playerTarget, 'toggleShuffle', 'SHF', 'Toggle shuffle'), makeDsTrigger(playerTarget, 'cycleRepeat', 'REP', 'Cycle repeat'), makeDsTrigger(playerTarget, 'toggleStore', 'ADDONS', 'Open Addons Store'));
    controls.append(transport, extras);
    const playlistEl = document.createElement('div');
    playlistEl.className = 'mp-wa-playlist';
    deck.append(titlebar, lcd, seekSlider, controls, playlistEl);
    container.append(deck);
    const syncUi = (snap)=>{
        clockEl.textContent = formatThemeTime(snap.currentTime);
        marqueeEl.textContent = snap.currentTrack ? `${snap.currentTrack.artist ? `${snap.currentTrack.artist} - ` : ''}${snap.currentTrack.title}` : 'mPlay3r — Load files or press Play';
        metaEl.textContent = `${snap.status.toUpperCase()} · VOL ${Math.round(snap.volume * 100)}%${snap.shuffle ? ' · SHF' : ''}${snap.repeat !== 'off' ? ` · REP:${snap.repeat.toUpperCase()}` : ''}`;
        seekSlider.value = snap.duration > 0 ? String(Math.round(snap.currentTime / snap.duration * 100)) : '0';
        playlistEl.innerHTML = '';
        for(let i = 0; i < snap.tracks.length; i += 1){
            const tr = snap.tracks[i];
            const item = document.createElement('div');
            item.className = `mp-wa-pl-item${i === snap.currentIndex ? ' --active' : ''}`;
            item.textContent = `${i + 1}. ${tr.artist ? `${tr.artist} - ` : ''}${tr.title}`;
            playlistEl.append(item);
        }
    };
    syncUi(ctx.getState());
    const unsubState = ctx.on('stateChange', (snap)=>syncUi(snap));
    const unsubTime = ctx.on('timeUpdate', ({ currentTime, duration })=>{
        clockEl.textContent = formatThemeTime(currentTime);
        if (duration > 0) seekSlider.value = String(Math.round(currentTime / duration * 100));
    });
    const unsubPl = ctx.on('playlistChange', ()=>syncUi(ctx.getState()));
    return ()=>{
        unsubState();
        unsubTime();
        unsubPl();
        container.innerHTML = '';
    };
}
function mountHifiRackLayout(ctx, container, playerTarget, onSwitchTheme) {
    container.innerHTML = '';
    const rack = document.createElement('div');
    rack.className = 'mp-hifi-rack';
    rack.setAttribute('role', 'region');
    rack.setAttribute('aria-label', 'mPlay3r Hi-Fi Rack Theme');
    const top = document.createElement('div');
    top.className = 'mp-hifi-top';
    const brand = document.createElement('span');
    brand.className = 'mp-hifi-brand';
    brand.textContent = 'MPLAY3R · REFERENCE HI-FI DECK';
    const switchRow = document.createElement('div');
    switchRow.style.cssText = 'display:flex;gap:6px';
    const waBtn = document.createElement('button');
    waBtn.type = 'button';
    waBtn.className = 'mp-hifi-btn';
    waBtn.textContent = 'Classic 2.x';
    waBtn.addEventListener('click', ()=>onSwitchTheme('mplay3r.theme-classic:winamp-classic'));
    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'mp-hifi-btn';
    minBtn.textContent = 'Minimal';
    minBtn.addEventListener('click', ()=>onSwitchTheme(null));
    switchRow.append(waBtn, minBtn);
    top.append(brand, switchRow);
    const vfd = document.createElement('div');
    vfd.className = 'mp-hifi-vfd';
    const vfdLeft = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'mp-hifi-vfd-title';
    const subEl = document.createElement('div');
    subEl.className = 'mp-hifi-vfd-sub';
    vfdLeft.append(titleEl, subEl);
    const timeEl = document.createElement('div');
    timeEl.className = 'mp-hifi-vfd-time';
    vfd.append(vfdLeft, timeEl);
    const bar = document.createElement('div');
    bar.className = 'mp-hifi-bar';
    const transport = document.createElement('div');
    transport.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    transport.append(makeDsTrigger(playerTarget, 'previous', 'Prev', 'Previous track'), makeDsTrigger(playerTarget, 'togglePlay', 'Play / Pause', 'Toggle play'), makeDsTrigger(playerTarget, 'stop', 'Stop', 'Stop'), makeDsTrigger(playerTarget, 'next', 'Next', 'Next track'), makeDsTrigger(playerTarget, 'openFilePicker', 'Load Media', 'Open files'), makeDsTrigger(playerTarget, 'toggleMute', 'Mute', 'Toggle mute'));
    const volWrap = document.createElement('label');
    volWrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8';
    volWrap.textContent = 'GAIN';
    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.value = String(Math.round(ctx.getState().volume * 100));
    volSlider.addEventListener('input', ()=>{
        void ctx.playback.setVolume(Number(volSlider.value) / 100);
    });
    volWrap.append(volSlider);
    bar.append(transport, volWrap);
    rack.append(top, vfd, bar);
    container.append(rack);
    const syncUi = (snap)=>{
        titleEl.textContent = snap.currentTrack?.title || 'STANDBY — NO DISC';
        subEl.textContent = [
            snap.currentTrack?.artist || 'mPlay3r Web Audio Engine',
            snap.currentTrack?.album,
            snap.status.toUpperCase()
        ].filter(Boolean).join(' · ');
        timeEl.textContent = formatThemeTime(snap.currentTime);
        volSlider.value = String(Math.round(snap.volume * 100));
    };
    syncUi(ctx.getState());
    const unsubState = ctx.on('stateChange', (snap)=>syncUi(snap));
    const unsubTime = ctx.on('timeUpdate', ({ currentTime })=>{
        timeEl.textContent = formatThemeTime(currentTime);
    });
    return ()=>{
        unsubState();
        unsubTime();
        container.innerHTML = '';
    };
}

export const manifest = {
    id: 'mplay3r.theme-classic',
    name: 'Structural Themes (Winamp Classic & Hi-Fi Rack)',
    version: '1.0.0',
    description: 'Full-layout structural themes built with registerTheme() and <ds-trigger>: Winamp Classic 2.x deck and brushed Hi-Fi Rack component with zero-interruption hot switching.',
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
        const switcher = new ThemeSwitchController(ctx.storage, ()=>resolveHostThemeAdapter(ctx.playerTarget));
        const triggerSwitch = (key)=>{
            void switcher.switchTo(key);
        };
        ctx.registerTheme({
            id: 'winamp-classic',
            name: 'Winamp Classic 2.x',
            css: WINAMP_CLASSIC_CSS,
            mountLayout: (container, target)=>mountWinampClassicLayout(ctx, container, target, triggerSwitch)
        });
        ctx.registerTheme({
            id: 'hifi-rack',
            name: 'Hi-Fi Rack',
            css: HIFI_RACK_CSS,
            mountLayout: (container, target)=>mountHifiRackLayout(ctx, container, target, triggerSwitch)
        });
        ctx.registerSlot({
            id: 'themes-switcher-panel',
            slot: 'panel',
            title: 'Themes',
            mount (container) {
                const render = ()=>{
                    const current = switcher.getActiveThemeKey();
                    container.innerHTML = '';
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.45rem';
                    const intro = document.createElement('div');
                    intro.style.cssText = 'font-size:0.74rem;color:var(--mp-text-muted)';
                    intro.textContent = 'Hot-switch full player layouts without interrupting audio playback:';
                    wrap.append(intro);
                    const choices = [
                        [
                            null,
                            'Minimal (Core Default)',
                            'Default lightweight 5-palette theme'
                        ],
                        [
                            'mplay3r.theme-classic:winamp-classic',
                            'Winamp Classic 2.x',
                            'Retro 275px beveled deck with green LCD & playlist'
                        ],
                        [
                            'mplay3r.theme-classic:hifi-rack',
                            'Hi-Fi Rack',
                            'Brushed gunmetal horizontal stereo deck with VFD display'
                        ]
                    ];
                    for (const [key, title, desc] of choices){
                        const active = current === key;
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.4rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
                        const meta = document.createElement('div');
                        const t = document.createElement('div');
                        t.style.cssText = 'font-size:0.79rem;font-weight:600';
                        t.textContent = title;
                        const d = document.createElement('div');
                        d.style.cssText = 'font-size:0.69rem;color:var(--mp-text-muted)';
                        d.textContent = desc;
                        meta.append(t, d);
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.textContent = active ? 'Active ✓' : 'Apply';
                        btn.style.cssText = active ? 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.71rem;font-weight:700;cursor:pointer' : 'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer';
                        btn.addEventListener('click', ()=>{
                            void switcher.switchTo(key).then(()=>render());
                        });
                        row.append(meta, btn);
                        wrap.append(row);
                    }
                    container.append(wrap);
                };
                render();
                return ()=>{
                    container.innerHTML = '';
                };
            }
        });
        await switcher.load();
    }
};
export default plugin;
