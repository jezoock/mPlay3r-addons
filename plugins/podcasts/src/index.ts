import type { MediaItem, MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  createPodcastMediaSourceProvider,
  fetchAndParsePodcastFeed,
  resolvePlatformUrlToFeed,
} from './directory';
import { formatPodcastTime } from './rss';
import type { PodcastEpisode, PodcastFeed } from './rss';
import {
  makeEpisodeKey,
  OfflineEpisodeManager,
  PodcastPlaybackController,
  PodcastStateStore,
} from './state';

export const manifest: PluginManifest = {
  id: 'mplay3r.podcasts',
  name: 'Podcasts & Streaming Sources',
  version: '1.0.0',
  description:
    'Search and subscribe to RSS/Atom podcasts (iTunes & Podcast Index), resolve streaming platform links to open RSS feeds, resume playback per episode, control speed (0.75x-2x), skip -15s/+30s, download episodes offline, and connect open MediaSourceProvider addons.',
  category: 'source',
  permissions: ['network', 'playlist-write', 'playback-control', 'track-metadata', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let activeOfflineManager: OfflineEpisodeManager | null = null;

const INPUT_CSS =
  'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.76rem';
const ROW_CSS =
  'display:flex;align-items:center;justify-content:space-between;gap:0.45rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
const LIST_CSS = 'display:flex;flex-direction:column;gap:0.3rem;max-height:14rem;overflow-y:auto';

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeBtn(
  label: string,
  onClick: () => void,
  variant: 'ghost' | 'accent' | 'solid' = 'ghost',
  ariaLabel?: string,
): HTMLButtonElement {
  const styles: Record<'ghost' | 'accent' | 'solid', string> = {
    ghost:
      'padding:0.18rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.7rem;cursor:pointer',
    accent:
      'padding:0.18rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
    solid:
      'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer',
  };
  const btn = makeEl('button', styles[variant], label);
  btn.type = 'button';
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  btn.addEventListener('click', onClick);
  return btn;
}

function makeMetaBlock(title: string, subtitle: string): HTMLDivElement {
  const meta = makeEl('div', 'min-width:0;flex:1');
  meta.append(
    makeEl('div', 'font-size:0.79rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title),
    makeEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', subtitle),
  );
  return meta;
}

function applyRateToPlayerTarget(playerTarget: string, rate: number): void {
  if (typeof document === 'undefined' || !playerTarget) {
    return;
  }
  const host = document.querySelector(playerTarget) as
    | (HTMLElement & { setPlaybackRate?: (r: number) => void })
    | null;
  if (!host) {
    return;
  }
  if (typeof host.setPlaybackRate === 'function') {
    host.setPlaybackRate(rate);
    return;
  }
  const media = host.querySelector('audio') as (HTMLAudioElement & { preservesPitch?: boolean }) | null;
  if (media) {
    media.playbackRate = rate;
    if ('preservesPitch' in media) {
      media.preservesPitch = true;
    }
  }
}

function guessAudioFormat(audioUrl: string, mimeType?: string): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'M4A';
  if (mime.includes('ogg') || mime.includes('opus')) return 'OGG';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'MP3';
  const extMatch = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(audioUrl);
  return extMatch ? extMatch[1].toUpperCase() : 'PODCAST';
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const fetcher = (input: string | URL, init?: RequestInit) => ctx.fetch(input, init);
    const store = new PodcastStateStore(ctx.storage);
    await store.load();

    const offlineManager = new OfflineEpisodeManager(store);
    activeOfflineManager = offlineManager;

    const controller = new PodcastPlaybackController(store, {
      seek: seconds => ctx.playback.seek(seconds),
      getCurrentTime: () => ctx.getState().currentTime,
      getDuration: () => ctx.getState().duration,
      applyPlaybackRate: rate => applyRateToPlayerTarget(ctx.playerTarget, rate),
    });

    // Register built-in Podcasts directory & platform resolver on 'media-source'.
    // Additional streaming connectors (e.g. Subsonic/Navidrome, Audius, SoundCloud public)
    // register on the same 'media-source' provider kind and are discovered automatically.
    ctx.registerProvider('media-source', createPodcastMediaSourceProvider(fetcher));

    let controlsSlotEl: HTMLElement | null = null;
    const renderControlsSlot = () => {
      if (!controlsSlotEl) {
        return;
      }
      const pState = controller.getState();
      if (!pState.activeEpisode) {
        controlsSlotEl.textContent = '';
        controlsSlotEl.style.display = 'none';
        return;
      }

      controlsSlotEl.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:0.35rem;font-size:0.72rem';
      controlsSlotEl.innerHTML = '';

      const backBtn = makeBtn(
        '-15s',
        () => void controller.skipBackward(15).then(() => renderControlsSlot()),
        'ghost',
        'Skip back 15 seconds',
      );
      const speedBtn = makeBtn(
        `${pState.playbackRate}×`,
        () =>
          void controller.cycleRate().then(rate => {
            renderControlsSlot();
            void ctx.notify(`Playback speed: ${rate}×`);
          }),
        'accent',
        'Cycle podcast playback speed',
      );
      const fwdBtn = makeBtn(
        '+30s',
        () => void controller.skipForward(30).then(() => renderControlsSlot()),
        'ghost',
        'Skip forward 30 seconds',
      );

      controlsSlotEl.append(backBtn, speedBtn, fwdBtn);

      if (pState.activeChapter) {
        const chap = makeEl(
          'span',
          'color:var(--mp-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14rem',
          `§ ${pState.activeChapter.title}`,
        );
        chap.title = `Active chapter (${formatPodcastTime(pState.activeChapter.startSeconds)})`;
        controlsSlotEl.append(chap);
      }
    };

    const playEpisode = async (episode: PodcastEpisode) => {
      const resolved = await offlineManager.resolvePlayableUrl(episode);
      controller.registerEpisode(episode, resolved.url);

      await ctx.playlist.clearPlaylist();
      const added = await ctx.playlist.addTracks(
        [
          {
            src: resolved.url,
            title: episode.title,
            artist: episode.showTitle,
            album: resolved.offline ? `${episode.showTitle} (Offline)` : episode.showTitle,
            duration: episode.duration,
            format: guessAudioFormat(episode.audioUrl, episode.mimeType),
            isObjectUrl: resolved.offline,
          },
        ],
        true,
      );

      if (added[0]) {
        await controller.onTrackChanged(added[0]);
        renderControlsSlot();
      }
      const key = makeEpisodeKey(episode.feedUrl, episode.id, episode.audioUrl);
      const resumeAt = store.getResumePosition(key);
      const suffix = resumeAt > 0 ? ` (resuming at ${formatPodcastTime(resumeAt)})` : '';
      await ctx.notify(`Playing ${episode.title}${suffix}`, 'success');
    };

    const playExternalMediaItem = async (item: MediaItem) => {
      await ctx.playlist.clearPlaylist();
      await ctx.playlist.addTracks(
        [
          {
            src: item.streamUrl,
            title: item.title,
            artist: item.artist,
            album: item.album,
            duration: item.duration,
            format: guessAudioFormat(item.streamUrl),
          },
        ],
        true,
      );
      await ctx.notify(`Playing ${item.title}`, 'success');
    };

    ctx.on('trackChange', ({ track }) => {
      void controller.onTrackChanged(track).then(() => renderControlsSlot());
    });

    ctx.on('timeUpdate', ({ currentTime, duration }) => {
      const prevChapter = controller.getState().activeChapter?.title;
      void controller.onTimeUpdate(currentTime, duration).then(nextChapter => {
        if (nextChapter?.title !== prevChapter) {
          renderControlsSlot();
        }
      });
    });

    ctx.registerSlot({
      id: 'podcast-controls',
      slot: 'track-info',
      mount(container) {
        controlsSlotEl = container;
        renderControlsSlot();
        return () => {
          controlsSlotEl = null;
        };
      },
    });

    ctx.registerSlot({
      id: 'podcasts-panel',
      slot: 'panel',
      title: 'Podcasts',
      mount(container) {
        let activeSourceId = 'subscriptions';
        let query = '';
        let loading = false;
        let statusMessage = '';
        let searchItems: MediaItem[] = [];
        let openedFeed: PodcastFeed | null = null;
        let expandedEpisodeKey: string | null = null;
        const downloadingKeys = new Set<string>();

        const openFeed = async (feedUrl: string, fallbackTitle?: string) => {
          loading = true;
          statusMessage = `Loading ${fallbackTitle || feedUrl}…`;
          renderPanel();
          try {
            openedFeed = await fetchAndParsePodcastFeed(feedUrl, fetcher);
            statusMessage = '';
          } catch (err) {
            statusMessage = err instanceof Error ? err.message : 'Unable to load podcast feed.';
            await ctx.notify(statusMessage, 'error');
          } finally {
            loading = false;
            renderPanel();
          }
        };

        const resolveAndOpenUrl = async (rawUrl: string) => {
          const trimmed = rawUrl.trim();
          if (!trimmed) return;
          loading = true;
          statusMessage = 'Resolving podcast / platform link…';
          renderPanel();
          try {
            const resolved = await resolvePlatformUrlToFeed(trimmed, fetcher);
            if (!resolved) {
              const providers = ctx.getProviders('media-source').filter(p => p.id !== 'mplay3r-podcasts');
              for (const provider of providers) {
                if (!provider.resolveUrl) continue;
                const resolvedItems = await provider.resolveUrl(trimmed);
                if (resolvedItems.length > 0) {
                  openedFeed = null;
                  searchItems = resolvedItems;
                  activeSourceId = provider.id;
                  statusMessage = `Resolved via ${provider.name}`;
                  loading = false;
                  renderPanel();
                  return;
                }
              }
              throw new Error('Could not resolve an open RSS audio feed from that URL.');
            }
            openedFeed = await fetchAndParsePodcastFeed(resolved.feedUrl, fetcher);
            statusMessage =
              resolved.kind === 'feed'
                ? ''
                : `Resolved ${resolved.platform} link → RSS (${openedFeed.episodes.length} episodes)`;
          } catch (err) {
            statusMessage = err instanceof Error ? err.message : 'Failed to resolve URL.';
            await ctx.notify(statusMessage, 'error');
          } finally {
            loading = false;
            renderPanel();
          }
        };

        const runSearch = async () => {
          openedFeed = null;
          if (activeSourceId === 'subscriptions' || activeSourceId === 'offline' || !query.trim()) {
            searchItems = [];
            statusMessage = '';
            renderPanel();
            return;
          }
          loading = true;
          statusMessage = 'Searching…';
          renderPanel();
          const providers = ctx
            .getProviders('media-source')
            .filter(p => activeSourceId === 'all' || p.id === activeSourceId);
          const collected: MediaItem[] = [];
          for (const provider of providers) {
            try {
              collected.push(...(await provider.search(query, { limit: 15 })));
            } catch {
              // Isolate individual provider network errors.
            }
          }
          searchItems = collected;
          loading = false;
          statusMessage = collected.length === 0 ? 'No podcasts or streams matched your search.' : '';
          renderPanel();
        };

        const renderFeedEpisodes = (feed: PodcastFeed): HTMLElement => {
          const box = makeEl('div', 'display:flex;flex-direction:column;gap:0.4rem');
          const header = makeEl('div', ROW_CSS);
          header.append(
            makeMetaBlock(feed.title, [feed.author, `${feed.episodes.length} episodes`].filter(Boolean).join(' · ')),
          );

          const actions = makeEl('div', 'display:flex;gap:0.3rem');
          const subscribed = store.isSubscribed(feed.feedUrl);
          actions.append(
            makeBtn('← Back', () => {
              openedFeed = null;
              renderPanel();
            }),
            makeBtn(
              subscribed ? 'Subscribed ✓' : '+ Subscribe',
              () => {
                void (subscribed
                  ? store.unsubscribe(feed.feedUrl)
                  : store.subscribe({
                      feedUrl: feed.feedUrl,
                      title: feed.title,
                      author: feed.author,
                      artworkUrl: feed.artworkUrl,
                      episodeCount: feed.episodes.length,
                    })
                ).then(() => renderPanel());
              },
              subscribed ? 'accent' : 'solid',
            ),
          );
          header.append(actions);
          box.append(header);

          const epList = makeEl('div', LIST_CSS);
          for (const ep of feed.episodes.slice(0, 50)) {
            const key = makeEpisodeKey(ep.feedUrl, ep.id, ep.audioUrl);
            const prog = store.getProgress(key);
            const resumeAt = store.getResumePosition(key);
            const isOffline = store.isOffline(key);
            const isDownloading = downloadingKeys.has(key);

            const row = makeEl(
              'div',
              'display:flex;flex-direction:column;gap:0.25rem;padding:0.36rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)',
            );
            const top = makeEl('div', 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem');
            const sub = [
              ep.publishedAt ? ep.publishedAt.slice(0, 10) : '',
              ep.duration ? formatPodcastTime(ep.duration) : '',
              resumeAt > 0 ? `Resume ${formatPodcastTime(resumeAt)}` : '',
              ep.chapters.length > 0 ? `${ep.chapters.length} ch.` : '',
              isOffline ? 'Offline' : '',
            ]
              .filter(Boolean)
              .join(' · ');
            top.append(makeMetaBlock(prog?.completed ? `✓ ${ep.title}` : ep.title, sub));

            const btns = makeEl('div', 'display:flex;gap:0.25rem');
            if (ep.description || ep.chapters.length > 0) {
              btns.append(
                makeBtn(expandedEpisodeKey === key ? 'Hide' : 'Notes', () => {
                  expandedEpisodeKey = expandedEpisodeKey === key ? null : key;
                  renderPanel();
                }),
              );
            }

            const offlineBtn = makeBtn(
              isDownloading ? '…' : isOffline ? 'Saved ✓' : '↓',
              () => {
                if (isOffline) {
                  void offlineManager.removeDownload(key).then(() => renderPanel());
                  return;
                }
                downloadingKeys.add(key);
                renderPanel();
                void offlineManager
                  .downloadEpisode(ep, fetcher)
                  .then(() => ctx.notify(`Downloaded "${ep.title}" for offline playback`, 'success'))
                  .catch(err => ctx.notify(err instanceof Error ? err.message : 'Offline download failed', 'error'))
                  .finally(() => {
                    downloadingKeys.delete(key);
                    renderPanel();
                  });
              },
              isOffline ? 'accent' : 'ghost',
              isOffline ? 'Remove offline download' : 'Download episode for offline playback',
            );
            offlineBtn.disabled = isDownloading;

            btns.append(
              offlineBtn,
              makeBtn(resumeAt > 0 ? 'Resume' : 'Play', () => void playEpisode(ep), 'accent'),
            );
            top.append(btns);
            row.append(top);

            if (expandedEpisodeKey === key) {
              const details = makeEl(
                'div',
                'font-size:0.72rem;color:var(--mp-text-muted);border-top:1px solid var(--mp-border);padding-top:0.3rem',
              );
              if (ep.description) {
                details.append(makeEl('p', 'margin:0 0 0.3rem 0;white-space:pre-line', ep.description.slice(0, 420)));
              }
              if (ep.chapters.length > 0) {
                const chapList = makeEl('div', 'display:flex;flex-wrap:wrap;gap:0.25rem');
                for (const ch of ep.chapters) {
                  chapList.append(
                    makeBtn(`${formatPodcastTime(ch.startSeconds)} ${ch.title}`, () => {
                      void (async () => {
                        if (controller.getState().activeEpisode?.id !== ep.id) {
                          await playEpisode(ep);
                        }
                        await ctx.playback.seek(ch.startSeconds);
                      })();
                    }),
                  );
                }
                details.append(chapList);
              }
              row.append(details);
            }

            epList.append(row);
          }

          box.append(epList);
          return box;
        };

        const renderPanel = () => {
          const providers = ctx.getProviders('media-source');
          container.innerHTML = '';
          const wrap = makeEl('div', 'display:flex;flex-direction:column;gap:0.5rem');

          const bar = makeEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem');
          const sourceSelect = makeEl('select', INPUT_CSS);
          sourceSelect.setAttribute('aria-label', 'Podcast or media source');
          const options: Array<[string, string]> = [
            ['subscriptions', `Subscriptions (${store.listSubscriptions().length})`],
            ['offline', `Offline (${store.listOffline().length})`],
            ['all', `All sources (${providers.length})`],
            ...providers.map(p => [p.id, p.name] as [string, string]),
          ];
          for (const [val, label] of options) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            opt.selected = val === activeSourceId;
            sourceSelect.append(opt);
          }
          sourceSelect.addEventListener('change', () => {
            activeSourceId = sourceSelect.value;
            void runSearch();
          });

          const triggerSearch = () => {
            if (activeSourceId === 'subscriptions' || activeSourceId === 'offline') {
              activeSourceId = 'mplay3r-podcasts';
            }
            void runSearch();
          };
          const searchInput = makeEl('input', `${INPUT_CSS};flex:1 1 9rem`);
          searchInput.type = 'search';
          searchInput.placeholder = 'Search podcasts / open sources…';
          searchInput.value = query;
          searchInput.addEventListener('input', () => {
            query = searchInput.value;
          });
          searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') triggerSearch();
          });

          bar.append(sourceSelect, searchInput, makeBtn(loading ? '…' : 'Search', triggerSearch, 'solid'));

          const urlForm = makeEl('form', 'display:flex;gap:0.35rem');
          const urlInput = makeEl('input', `${INPUT_CSS};flex:1`);
          urlInput.type = 'url';
          urlInput.placeholder = 'RSS/Atom feed, Apple Podcasts or Spotify show URL…';
          const openBtn = makeEl('button', `${INPUT_CSS};border-radius:999px;cursor:pointer`, 'Open URL');
          openBtn.type = 'submit';
          urlForm.addEventListener('submit', event => {
            event.preventDefault();
            const raw = urlInput.value.trim();
            if (!raw) return;
            urlInput.value = '';
            void resolveAndOpenUrl(raw);
          });
          urlForm.append(urlInput, openBtn);
          wrap.append(bar, urlForm);

          if (statusMessage) {
            wrap.append(makeEl('div', 'font-size:0.73rem;color:var(--mp-text-muted)', statusMessage));
          }

          if (openedFeed) {
            wrap.append(renderFeedEpisodes(openedFeed));
          } else {
            const list = makeEl('div', LIST_CSS);
            const appendEmpty = (msg: string) =>
              list.append(makeEl('p', 'margin:0.3rem 0;font-size:0.76rem;color:var(--mp-text-muted)', msg));

            if (activeSourceId === 'subscriptions') {
              const subs = store.listSubscriptions();
              if (subs.length === 0) {
                appendEmpty('No podcast subscriptions yet. Search a show or paste an RSS / Apple / Spotify link above.');
              } else {
                for (const sub of subs) {
                  const row = makeEl('div', ROW_CSS);
                  row.append(
                    makeMetaBlock(
                      sub.title,
                      [sub.author, sub.episodeCount ? `${sub.episodeCount} ep.` : ''].filter(Boolean).join(' · '),
                    ),
                    makeBtn('Episodes', () => void openFeed(sub.feedUrl, sub.title), 'accent'),
                  );
                  list.append(row);
                }
              }
            } else if (activeSourceId === 'offline') {
              const recs = store.listOffline();
              if (recs.length === 0) {
                appendEmpty('No episodes downloaded for offline playback yet.');
              } else {
                for (const rec of recs) {
                  const row = makeEl('div', ROW_CSS);
                  const btns = makeEl('div', 'display:flex;gap:0.25rem');
                  btns.append(
                    makeBtn(
                      '✕',
                      () => void offlineManager.removeDownload(rec.episodeKey).then(() => renderPanel()),
                      'ghost',
                      `Delete offline copy of ${rec.title}`,
                    ),
                    makeBtn(
                      'Play',
                      () => {
                        const [feedPart, idPart] = rec.episodeKey.split('::');
                        void playEpisode({
                          id: idPart || rec.audioUrl,
                          feedUrl: feedPart || 'direct',
                          showTitle: rec.showTitle,
                          title: rec.title,
                          audioUrl: rec.audioUrl,
                          mimeType: rec.mimeType,
                          chapters: [],
                        });
                      },
                      'accent',
                    ),
                  );
                  row.append(
                    makeMetaBlock(rec.title, `${rec.showTitle} · ${(rec.sizeBytes / (1024 * 1024)).toFixed(1)} MB`),
                    btns,
                  );
                  list.append(row);
                }
              }
            } else if (searchItems.length === 0 && !loading) {
              appendEmpty('Type a show, creator, or track name to search installed media sources.');
            } else {
              for (const item of searchItems) {
                const isPodcastFeed = item.providerId === 'mplay3r-podcasts';
                const row = makeEl('div', ROW_CSS);
                row.append(
                  makeMetaBlock(item.title, [item.artist, item.album, item.providerId].filter(Boolean).join(' · ')),
                  makeBtn(
                    isPodcastFeed ? 'Episodes' : 'Play',
                    () => void (isPodcastFeed ? openFeed(item.streamUrl, item.title) : playExternalMediaItem(item)),
                    'accent',
                  ),
                );
                list.append(row);
              }
            }
            wrap.append(list);
          }

          container.append(wrap);
        };

        renderPanel();
        return () => {
          container.innerHTML = '';
        };
      },
    });
  },

  deactivate(): void {
    activeOfflineManager?.dispose();
    activeOfflineManager = null;
  },
};

export default plugin;
