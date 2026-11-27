import type { MPlay3rPlugin, PluginContext, PluginManifest, RadioStation } from '../../../sdk/types';
import { isHlsStreamUrl, parseHlsMasterPlaylist } from './icy';
import { LiveStreamTracker, RadioFavoritesStore } from './live-controller';
import { createRadioBrowserProvider } from './radio-browser';

export const manifest: PluginManifest = {
  id: 'mplay3r.radio',
  name: 'Web & FM Radio',
  version: '1.0.0',
  description:
    'Stream web radios and FM/DAB+ IP broadcasts via Radio Browser, direct Icecast/SHOUTcast/HLS URLs, ICY live titles, favorites, and ISP box micro-plugins.',
  category: 'source',
  permissions: ['network', 'playlist-write', 'playback-control', 'track-metadata', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

async function resolvePlayableUrl(station: RadioStation, ctx: PluginContext): Promise<string> {
  if (!isHlsStreamUrl(station.streamUrl)) {
    return station.streamUrl;
  }
  try {
    const res = await ctx.fetch(station.streamUrl);
    if (res.ok) {
      const text = await res.text();
      const variants = parseHlsMasterPlaylist(text, station.streamUrl);
      if (variants.length > 0) {
        return variants[0].url;
      }
    }
  } catch {
    // Fall back to original HLS URL directly (native Safari/WebKit HLS playback).
  }
  return station.streamUrl;
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const tracker = new LiveStreamTracker();
    const favorites = new RadioFavoritesStore(ctx.storage);
    await favorites.load();

    // Register default Radio Browser directory; ISP-box micro-plugins (e.g. radio-freebox)
    // also register on 'radio' and are discovered automatically via ctx.getProviders('radio').
    ctx.registerProvider('radio', createRadioBrowserProvider((input, init) => ctx.fetch(input, init)));

    let liveBadgeEl: HTMLElement | null = null;
    const renderLiveBadge = () => {
      if (!liveBadgeEl) {
        return;
      }
      const live = tracker.getState();
      if (!live.isLive || !live.station) {
        liveBadgeEl.textContent = '';
        liveBadgeEl.style.display = 'none';
        return;
      }
      liveBadgeEl.style.display = 'flex';
      liveBadgeEl.style.alignItems = 'center';
      liveBadgeEl.style.gap = '0.5rem';
      liveBadgeEl.style.fontSize = '0.75rem';
      const suffix = live.reconnecting
        ? `Reconnecting (${live.reconnectAttempt})…`
        : live.nowPlaying || live.station.genre || live.station.codec || 'Live stream';
      liveBadgeEl.innerHTML = '';

      const pill = document.createElement('span');
      pill.textContent = 'LIVE';
      pill.style.padding = '0.1rem 0.45rem';
      pill.style.borderRadius = '999px';
      pill.style.fontWeight = '700';
      pill.style.fontSize = '0.6875rem';
      pill.style.background = 'var(--ds-color-primary-base)';
      pill.style.color = 'var(--mp-accent-contrast)';

      const info = document.createElement('span');
      info.textContent = `${live.station.name} · ${suffix}`;
      info.style.color = 'var(--mp-text-muted)';
      info.style.overflow = 'hidden';
      info.style.textOverflow = 'ellipsis';
      info.style.whiteSpace = 'nowrap';

      liveBadgeEl.append(pill, info);
    };

    const playStation = async (station: RadioStation) => {
      clearTimeout(reconnectTimer);
      const streamUrl = await resolvePlayableUrl(station, ctx);
      const resolvedStation: RadioStation = { ...station, streamUrl, isLive: true };
      tracker.registerLiveStation(resolvedStation);

      await ctx.playlist.clearPlaylist();
      const added = await ctx.playlist.addTracks(
        [
          {
            src: streamUrl,
            title: station.name,
            artist: station.genre ? `LIVE · ${station.genre}` : 'LIVE Radio',
            format: isHlsStreamUrl(streamUrl) ? 'HLS' : station.codec || 'LIVE',
          },
        ],
        true,
      );
      if (added[0]) {
        tracker.onTrackChanged(added[0]);
        renderLiveBadge();
      }
      await ctx.notify(`Tuning ${station.name}`, 'success');
    };

    ctx.on('trackChange', ({ track }) => {
      clearTimeout(reconnectTimer);
      tracker.onTrackChanged(track);
      renderLiveBadge();
    });

    ctx.on('stateChange', snapshot => {
      if (snapshot.status === 'playing' && tracker.getState().reconnecting) {
        tracker.markRecovered();
        renderLiveBadge();
      }
    });

    ctx.on('error', () => {
      const delay = tracker.scheduleReconnect();
      renderLiveBadge();
      if (delay !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          void ctx.playback.play();
        }, delay);
      }
    });

    ctx.registerSlot({
      id: 'live-badge',
      slot: 'track-info',
      mount(container) {
        liveBadgeEl = container;
        renderLiveBadge();
        return () => {
          liveBadgeEl = null;
        };
      },
    });

    ctx.registerSlot({
      id: 'radio-panel',
      slot: 'panel',
      title: 'Radios',
      mount(container) {
        let activeProviderId = 'all';
        let query = '';
        let country = '';
        let stations: RadioStation[] = [];
        let loading = false;

        const renderPanel = () => {
          const providers = ctx.getProviders('radio');
          container.innerHTML = '';

          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.flexDirection = 'column';
          wrap.style.gap = '0.5rem';

          const bar = document.createElement('div');
          bar.style.display = 'flex';
          bar.style.flexWrap = 'wrap';
          bar.style.gap = '0.35rem';

          const providerSelect = document.createElement('select');
          providerSelect.setAttribute('aria-label', 'Radio source');
          providerSelect.style.padding = '0.3rem 0.5rem';
          providerSelect.style.borderRadius = '6px';
          providerSelect.style.border = '1px solid var(--mp-border)';
          providerSelect.style.background = 'var(--mp-bg)';
          providerSelect.style.color = 'var(--mp-text)';
          providerSelect.style.fontSize = '0.78rem';

          const options: Array<[string, string]> = [
            ['all', `All sources (${providers.length})`],
            ['favorites', `Favorites (${favorites.list().length})`],
            ...providers.map(p => [p.id, p.name] as [string, string]),
          ];
          for (const [val, label] of options) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            opt.selected = val === activeProviderId;
            providerSelect.append(opt);
          }
          providerSelect.addEventListener('change', () => {
            activeProviderId = providerSelect.value;
            void runSearch();
          });

          const searchInput = document.createElement('input');
          searchInput.type = 'search';
          searchInput.placeholder = 'Search FM / Web radios…';
          searchInput.value = query;
          searchInput.style.flex = '1 1 8rem';
          searchInput.style.padding = '0.3rem 0.55rem';
          searchInput.style.borderRadius = '6px';
          searchInput.style.border = '1px solid var(--mp-border)';
          searchInput.style.background = 'var(--mp-bg)';
          searchInput.style.color = 'var(--mp-text)';
          searchInput.style.fontSize = '0.78rem';
          searchInput.addEventListener('input', () => {
            query = searchInput.value;
          });

          const countryInput = document.createElement('input');
          countryInput.type = 'text';
          countryInput.placeholder = 'FR';
          countryInput.maxLength = 2;
          countryInput.value = country;
          countryInput.style.width = '3rem';
          countryInput.style.padding = '0.3rem 0.45rem';
          countryInput.style.borderRadius = '6px';
          countryInput.style.border = '1px solid var(--mp-border)';
          countryInput.style.background = 'var(--mp-bg)';
          countryInput.style.color = 'var(--mp-text)';
          countryInput.style.fontSize = '0.78rem';
          countryInput.addEventListener('input', () => {
            country = countryInput.value;
          });

          const searchBtn = document.createElement('button');
          searchBtn.type = 'button';
          searchBtn.textContent = loading ? '…' : 'Search';
          searchBtn.style.padding = '0.3rem 0.65rem';
          searchBtn.style.borderRadius = '999px';
          searchBtn.style.border = '1px solid var(--ds-color-primary-base)';
          searchBtn.style.background = 'var(--ds-color-primary-base)';
          searchBtn.style.color = 'var(--mp-accent-contrast)';
          searchBtn.style.fontSize = '0.75rem';
          searchBtn.style.cursor = 'pointer';
          searchBtn.addEventListener('click', () => void runSearch());

          bar.append(providerSelect, searchInput, countryInput, searchBtn);

          const directForm = document.createElement('form');
          directForm.style.display = 'flex';
          directForm.style.gap = '0.35rem';
          const directInput = document.createElement('input');
          directInput.type = 'url';
          directInput.placeholder = 'Direct Icecast / SHOUTcast / HLS .m3u8 URL';
          directInput.style.flex = '1';
          directInput.style.padding = '0.28rem 0.55rem';
          directInput.style.borderRadius = '6px';
          directInput.style.border = '1px solid var(--mp-border)';
          directInput.style.background = 'var(--mp-bg)';
          directInput.style.color = 'var(--mp-text)';
          directInput.style.fontSize = '0.75rem';
          const tuneBtn = document.createElement('button');
          tuneBtn.type = 'submit';
          tuneBtn.textContent = 'Tune URL';
          tuneBtn.style.padding = '0.28rem 0.6rem';
          tuneBtn.style.borderRadius = '999px';
          tuneBtn.style.border = '1px solid var(--mp-border)';
          tuneBtn.style.background = 'var(--mp-bg)';
          tuneBtn.style.color = 'var(--mp-text)';
          tuneBtn.style.fontSize = '0.75rem';
          tuneBtn.style.cursor = 'pointer';
          directForm.addEventListener('submit', event => {
            event.preventDefault();
            const rawUrl = directInput.value.trim();
            if (!rawUrl) return;
            void playStation({
              id: `direct:${rawUrl}`,
              name: rawUrl.replace(/^https?:\/\//i, '').slice(0, 48),
              streamUrl: rawUrl,
              providerId: 'direct',
              isLive: true,
            });
            directInput.value = '';
          });
          directForm.append(directInput, tuneBtn);

          const list = document.createElement('div');
          list.style.display = 'flex';
          list.style.flexDirection = 'column';
          list.style.gap = '0.3rem';
          list.style.maxHeight = '14rem';
          list.style.overflowY = 'auto';

          if (stations.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = loading ? 'Loading stations…' : 'Search for a station or pick a source above.';
            empty.style.margin = '0.4rem 0';
            empty.style.fontSize = '0.78rem';
            empty.style.color = 'var(--mp-text-muted)';
            list.append(empty);
          } else {
            for (const station of stations) {
              const row = document.createElement('div');
              row.style.display = 'flex';
              row.style.alignItems = 'center';
              row.style.justifyContent = 'space-between';
              row.style.gap = '0.5rem';
              row.style.padding = '0.35rem 0.5rem';
              row.style.borderRadius = '6px';
              row.style.border = '1px solid var(--mp-border)';
              row.style.background = 'var(--mp-bg)';

              const meta = document.createElement('div');
              meta.style.minWidth = '0';
              meta.style.flex = '1';
              const title = document.createElement('div');
              title.textContent = station.name;
              title.style.fontSize = '0.8rem';
              title.style.fontWeight = '600';
              title.style.overflow = 'hidden';
              title.style.textOverflow = 'ellipsis';
              title.style.whiteSpace = 'nowrap';
              const sub = document.createElement('div');
              sub.textContent = [station.country, station.genre, station.bitrate ? `${station.bitrate}k` : '', station.providerId]
                .filter(Boolean)
                .join(' · ');
              sub.style.fontSize = '0.7rem';
              sub.style.color = 'var(--mp-text-muted)';
              meta.append(title, sub);

              const btns = document.createElement('div');
              btns.style.display = 'flex';
              btns.style.gap = '0.3rem';

              const favBtn = document.createElement('button');
              favBtn.type = 'button';
              favBtn.textContent = favorites.has(station.id) ? '★' : '☆';
              favBtn.setAttribute('aria-label', `Toggle favorite ${station.name}`);
              favBtn.style.border = '1px solid var(--mp-border)';
              favBtn.style.borderRadius = '6px';
              favBtn.style.background = 'transparent';
              favBtn.style.color = favorites.has(station.id) ? 'var(--ds-color-primary-base)' : 'var(--mp-text-muted)';
              favBtn.style.cursor = 'pointer';
              favBtn.addEventListener('click', async () => {
                await favorites.toggle(station);
                if (activeProviderId === 'favorites') {
                  stations = favorites.list();
                }
                renderPanel();
              });

              const playBtn = document.createElement('button');
              playBtn.type = 'button';
              playBtn.textContent = 'Play';
              playBtn.style.padding = '0.2rem 0.55rem';
              playBtn.style.borderRadius = '999px';
              playBtn.style.border = '1px solid var(--ds-color-primary-base)';
              playBtn.style.background = 'var(--mp-accent-soft)';
              playBtn.style.color = 'var(--ds-color-primary-base)';
              playBtn.style.fontSize = '0.72rem';
              playBtn.style.cursor = 'pointer';
              playBtn.addEventListener('click', () => void playStation(station));

              btns.append(favBtn, playBtn);
              row.append(meta, btns);
              list.append(row);
            }
          }

          wrap.append(bar, directForm, list);
          container.append(wrap);
        };

        const runSearch = async () => {
          if (activeProviderId === 'favorites') {
            stations = favorites.list();
            renderPanel();
            return;
          }
          loading = true;
          renderPanel();
          const providers = ctx.getProviders('radio').filter(p => activeProviderId === 'all' || p.id === activeProviderId);
          const collected: RadioStation[] = [];
          for (const provider of providers) {
            try {
              const found = query.trim() || country.trim() || !provider.listFeatured
                ? await provider.searchStations(query, { country, limit: 15 })
                : await provider.listFeatured();
              collected.push(...found);
            } catch {
              // Isolate individual provider network failures.
            }
          }
          stations = collected;
          loading = false;
          renderPanel();
        };

        renderPanel();
        void runSearch();
        return () => {
          container.innerHTML = '';
        };
      },
    });
  },

  deactivate(): void {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  },
};

export default plugin;
