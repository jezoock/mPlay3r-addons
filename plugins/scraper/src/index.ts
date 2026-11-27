import type { MPlay3rPlugin, PluginContext, PluginManifest, Track } from '../../../sdk/types';
import { getActiveLrcWindow, parseLrc } from './lrc';
import type { ParsedLrc } from './lrc';
import { MetadataScraperService } from './providers';
import type { ScrapedTrackMetadata } from './providers';

export const manifest: PluginManifest = {
  id: 'mplay3r.scraper',
  name: 'Metadata Scraper (Cover Art & Synced Lyrics)',
  version: '1.0.0',
  description:
    '100% opt-in metadata enrichment on track change: HD cover art (MusicBrainz + Cover Art Archive), synced .lrc lyrics (LRCLIB), persistent cache, polite rate limiting, and offline resilience.',
  category: 'scraper',
  permissions: ['network', 'track-metadata', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let activeScraperSeq = 0;

function scEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scBtn(label: string, onClick: () => void, accent = false): HTMLButtonElement {
  const btn = scEl(
    'button',
    accent
      ? 'padding:0.18rem 0.5rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.7rem;font-weight:600;cursor:pointer'
      : 'padding:0.18rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.7rem;cursor:pointer',
    label,
  );
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const service = new MetadataScraperService({
      fetcher: (input, init) => ctx.fetch(input, init),
      storage: ctx.storage,
    });
    await service.load();

    let currentTrack: Track | null = ctx.getState().currentTrack;
    let currentMeta: ScrapedTrackMetadata | null = null;
    let currentLrc: ParsedLrc | null = null;
    let currentTime = ctx.getState().currentTime;
    let activeLineIdx = -1;
    let loading = false;
    let statusNote = '';

    let trackInfoEl: HTMLElement | null = null;
    let rerenderPanel: (() => void) | null = null;

    const renderTrackInfo = () => {
      if (!trackInfoEl) return;
      if (!currentMeta) {
        trackInfoEl.textContent = '';
        trackInfoEl.style.display = 'none';
        return;
      }

      const lrcWin = currentLrc ? getActiveLrcWindow(currentLrc.lines, currentTime) : null;
      const lineText = lrcWin?.active?.text || lrcWin?.next?.text || currentMeta.album || '';
      if (!currentMeta.coverArtThumbUrl && !lineText) {
        trackInfoEl.style.display = 'none';
        return;
      }

      trackInfoEl.style.cssText = 'display:flex;align-items:center;gap:0.45rem;font-size:0.74rem;min-width:0';
      trackInfoEl.innerHTML = '';

      if (currentMeta.coverArtThumbUrl) {
        const img = scEl('img', 'width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0');
        img.src = currentMeta.coverArtThumbUrl;
        img.alt = `${currentMeta.album || currentMeta.title} cover art`;
        trackInfoEl.append(img);
      }

      if (lineText) {
        const lyricSpan = scEl(
          'span',
          'color:var(--mp-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic',
          lrcWin?.active ? `♪ ${lineText}` : lineText,
        );
        trackInfoEl.append(lyricSpan);
      }
    };

    const runScrapeForTrack = async (track: Track | null, forceRefresh = false) => {
      activeScraperSeq += 1;
      const seq = activeScraperSeq;
      currentTrack = track;
      currentMeta = null;
      currentLrc = null;
      activeLineIdx = -1;

      if (!track) {
        statusNote = '';
        renderTrackInfo();
        rerenderPanel?.();
        return;
      }

      if (!forceRefresh && !service.getSettings().autoScrape) {
        statusNote = 'Auto-scraping paused (click Refresh to fetch).';
        renderTrackInfo();
        rerenderPanel?.();
        return;
      }

      loading = true;
      statusNote = 'Enriching cover art & synced lyrics…';
      renderTrackInfo();
      rerenderPanel?.();

      const outcome = await service.scrapeTrack(track, {
        forceRefresh,
        updateTrackMetadata: (id, patch) => ctx.updateTrackMetadata(id, patch),
      });
      if (seq !== activeScraperSeq) {
        return;
      }

      loading = false;
      currentMeta = outcome.metadata;
      currentLrc = outcome.metadata?.syncedLyrics ? parseLrc(outcome.metadata.syncedLyrics) : null;
      activeLineIdx = currentLrc ? getActiveLrcWindow(currentLrc.lines, currentTime).index : -1;

      if (outcome.offline && !outcome.metadata) {
        statusNote = 'Offline — no cached metadata for this track.';
      } else if (outcome.rateLimited && !outcome.metadata) {
        statusNote = 'Rate-limited by upstream API — will retry later.';
      } else if (!outcome.metadata) {
        statusNote = 'No online cover art or lyrics found for this track.';
      } else {
        const srcList = outcome.metadata.sources.join(' · ');
        statusNote = outcome.fromCache ? `Cached (${srcList})` : srcList;
      }

      renderTrackInfo();
      rerenderPanel?.();
    };

    ctx.on('trackChange', ({ track }) => {
      currentTime = 0;
      void runScrapeForTrack(track, false);
    });

    ctx.on('timeUpdate', ({ currentTime: t }) => {
      currentTime = t;
      if (!currentLrc || currentLrc.lines.length === 0) return;
      const nextIdx = getActiveLrcWindow(currentLrc.lines, t).index;
      if (nextIdx !== activeLineIdx) {
        activeLineIdx = nextIdx;
        renderTrackInfo();
        rerenderPanel?.();
      }
    });

    ctx.registerSlot({
      id: 'scraper-now-playing',
      slot: 'track-info',
      mount(container) {
        trackInfoEl = container;
        renderTrackInfo();
        return () => {
          trackInfoEl = null;
        };
      },
    });

    ctx.registerSlot({
      id: 'scraper-panel',
      slot: 'panel',
      title: 'Lyrics & Info',
      mount(container) {
        const renderPanel = () => {
          const settings = service.getSettings();
          container.innerHTML = '';

          const wrap = scEl('div', 'display:flex;flex-direction:column;gap:0.5rem');

          const controls = scEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem;align-items:center;justify-content:space-between');
          const btnGroup = scEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem');
          btnGroup.append(
            scBtn(
              settings.autoScrape ? 'Auto: ON' : 'Auto: OFF',
              () => void service.updateSettings({ autoScrape: !settings.autoScrape }).then(() => renderPanel()),
              settings.autoScrape,
            ),
            scBtn(loading ? '…' : 'Refresh', () => void runScrapeForTrack(currentTrack, true)),
            scBtn(`Clear Cache (${service.getCacheSize()})`, () => {
              void service.clearCache().then(() => {
                statusNote = 'Metadata cache cleared.';
                renderPanel();
              });
            }),
          );
          controls.append(
            btnGroup,
            scEl('span', 'font-size:0.69rem;color:var(--mp-text-muted)', statusNote),
          );
          wrap.append(controls);

          if (!currentTrack) {
            wrap.append(
              scEl('p', 'margin:0.3rem 0;font-size:0.75rem;color:var(--mp-text-muted)', 'Play a track to fetch HD cover art and synced lyrics.'),
            );
            container.append(wrap);
            return;
          }

          if (currentMeta) {
            const card = scEl(
              'div',
              'display:flex;gap:0.65rem;align-items:center;padding:0.45rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)',
            );
            if (currentMeta.coverArtUrl || currentMeta.coverArtThumbUrl) {
              const art = scEl('img', 'width:68px;height:68px;border-radius:6px;object-fit:cover;flex-shrink:0');
              art.src = currentMeta.coverArtThumbUrl || currentMeta.coverArtUrl || '';
              art.alt = `${currentMeta.title} cover`;
              card.append(art);
            }
            const metaCol = scEl('div', 'min-width:0;flex:1;display:flex;flex-direction:column;gap:0.15rem');
            metaCol.append(
              scEl('div', 'font-size:0.84rem;font-weight:700', currentMeta.title),
              scEl(
                'div',
                'font-size:0.74rem;color:var(--mp-text-muted)',
                [currentMeta.artist, currentMeta.album, currentMeta.releaseDate].filter(Boolean).join(' · '),
              ),
            );
            if (currentMeta.bio) {
              metaCol.append(scEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', currentMeta.bio));
            }
            card.append(metaCol);
            wrap.append(card);

            const lyricsBox = scEl(
              'div',
              'max-height:13rem;overflow-y:auto;padding:0.45rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);display:flex;flex-direction:column;gap:0.2rem',
            );

            if (currentLrc && currentLrc.lines.length > 0) {
              for (let i = 0; i < currentLrc.lines.length; i += 1) {
                const line = currentLrc.lines[i];
                const isActive = i === activeLineIdx;
                const row = scEl(
                  'div',
                  isActive
                    ? 'font-size:0.8rem;font-weight:700;color:var(--ds-color-primary-base)'
                    : 'font-size:0.74rem;color:var(--mp-text-muted)',
                  line.text || '···',
                );
                lyricsBox.append(row);
              }
            } else if (currentMeta.plainLyrics) {
              lyricsBox.append(
                scEl('pre', 'margin:0;white-space:pre-wrap;font-family:inherit;font-size:0.74rem;color:var(--mp-text)', currentMeta.plainLyrics),
              );
            } else {
              lyricsBox.append(scEl('span', 'font-size:0.73rem;color:var(--mp-text-muted)', 'No lyrics available for this track.'));
            }
            wrap.append(lyricsBox);
          }

          container.append(wrap);
        };

        rerenderPanel = renderPanel;
        renderPanel();
        return () => {
          rerenderPanel = null;
          container.innerHTML = '';
        };
      },
    });

    if (currentTrack && service.getSettings().autoScrape) {
      void runScrapeForTrack(currentTrack, false);
    }
  },

  deactivate(): void {
    activeScraperSeq += 1;
  },
};

export default plugin;
