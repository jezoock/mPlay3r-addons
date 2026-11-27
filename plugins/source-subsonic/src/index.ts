import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { createSubsonicMediaSourceProvider, SubsonicClient } from './client';
import type { SubsonicConfig, SubsonicPlaylist, SubsonicSong } from './client';

export const manifest: PluginManifest = {
  id: 'mplay3r.source-subsonic',
  name: 'Subsonic & Navidrome Connector',
  version: '1.0.0',
  description:
    'Connect to self-hosted Subsonic, OpenSubsonic, Navidrome, or Airsonic servers using salted MD5 token authentication, search songs/playlists, play random mixes, and expose a MediaSourceProvider.',
  category: 'source',
  permissions: ['network', 'playlist-write', 'playback-control', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

const SUBSONIC_CONFIG_KEY = 'subsonicConfig';
const SUB_INPUT_CSS =
  'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.75rem';
const SUB_ROW_CSS =
  'display:flex;align-items:center;justify-content:space-between;gap:0.45rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';

function subEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function subBtn(
  label: string,
  onClick: () => void,
  variant: 'ghost' | 'accent' | 'solid' = 'ghost',
): HTMLButtonElement {
  const styles: Record<'ghost' | 'accent' | 'solid', string> = {
    ghost:
      'padding:0.2rem 0.48rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer',
    accent:
      'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
    solid:
      'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer',
  };
  const btn = subEl('button', styles[variant], label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const client = new SubsonicClient((input, init) => ctx.fetch(input, init));
    const saved = await ctx.storage.get<SubsonicConfig>(SUBSONIC_CONFIG_KEY);
    if (saved && typeof saved.baseUrl === 'string' && saved.username && saved.password) {
      try {
        client.configure(saved);
      } catch {
        // Ignore invalid persisted settings.
      }
    }

    ctx.registerProvider('media-source', createSubsonicMediaSourceProvider(client));

    const playSongs = async (songs: SubsonicSong[], label: string) => {
      if (songs.length === 0) return;
      await ctx.playlist.clearPlaylist();
      await ctx.playlist.addTracks(
        songs.map(s => ({
          src: client.getStreamUrl(s.id),
          title: s.title,
          artist: s.artist,
          album: s.album,
          duration: s.duration,
          format: s.suffix ? s.suffix.toUpperCase() : 'STREAM',
        })),
        true,
      );
      await ctx.notify(`Streaming ${label}`, 'success');
    };

    ctx.registerSlot({
      id: 'subsonic-panel',
      slot: 'panel',
      title: 'Subsonic',
      mount(container) {
        let urlDraft = client.getConfig()?.baseUrl || '';
        let userDraft = client.getConfig()?.username || '';
        let passDraft = '';
        let queryDraft = '';
        let statusLine = '';
        let songs: SubsonicSong[] = [];
        let playlists: SubsonicPlaylist[] = [];
        let busy = false;

        const refreshPlaylists = async () => {
          if (!client.isConfigured()) return;
          try {
            playlists = await client.getPlaylists();
          } catch {
            playlists = [];
          }
        };

        const runSearch = async (random = false) => {
          if (!client.isConfigured()) return;
          busy = true;
          render();
          try {
            songs = random || !queryDraft.trim() ? await client.getRandomSongs(20) : await client.searchSongs(queryDraft, 25);
            statusLine = songs.length === 0 ? 'No matching tracks found.' : `${songs.length} track(s)`;
          } catch (err) {
            statusLine = err instanceof Error ? err.message : 'Subsonic search failed.';
            await ctx.notify(statusLine, 'error');
          } finally {
            busy = false;
            render();
          }
        };

        const render = () => {
          container.innerHTML = '';
          const wrap = subEl('div', 'display:flex;flex-direction:column;gap:0.45rem');
          const cfg = client.getConfig();

          if (!cfg) {
            const form = subEl('form', 'display:flex;flex-wrap:wrap;gap:0.35rem');
            const uIn = subEl('input', `${SUB_INPUT_CSS};flex:1 1 11rem`);
            uIn.type = 'url';
            uIn.placeholder = 'https://navidrome.example.com';
            uIn.value = urlDraft;
            uIn.addEventListener('input', () => {
              urlDraft = uIn.value;
            });

            const userIn = subEl('input', `${SUB_INPUT_CSS};width:7rem`);
            userIn.placeholder = 'Username';
            userIn.value = userDraft;
            userIn.addEventListener('input', () => {
              userDraft = userIn.value;
            });

            const passIn = subEl('input', `${SUB_INPUT_CSS};width:7rem`);
            passIn.type = 'password';
            passIn.placeholder = 'Password';
            passIn.value = passDraft;
            passIn.addEventListener('input', () => {
              passDraft = passIn.value;
            });

            const connectBtn = subEl(
              'button',
              'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer',
              busy ? '…' : 'Connect',
            );
            connectBtn.type = 'submit';

            form.addEventListener('submit', event => {
              event.preventDefault();
              void (async () => {
                busy = true;
                render();
                try {
                  const nextCfg = client.configure({
                    baseUrl: urlDraft,
                    username: userDraft,
                    password: passDraft,
                  });
                  const ping = await client.ping();
                  if (!ping.ok) {
                    client.clearConfig();
                    throw new Error(ping.errorMessage || 'Authentication failed');
                  }
                  await ctx.storage.set(SUBSONIC_CONFIG_KEY, nextCfg);
                  passDraft = '';
                  statusLine = `Connected (${ping.serverType || 'Subsonic'} ${ping.serverVersion || ''})`.trim();
                  await refreshPlaylists();
                  await runSearch(true);
                } catch (err) {
                  statusLine = err instanceof Error ? err.message : 'Connection failed.';
                  await ctx.notify(statusLine, 'error');
                  busy = false;
                  render();
                }
              })();
            });

            form.append(uIn, userIn, passIn, connectBtn);
            wrap.append(form);
            if (statusLine) {
              wrap.append(subEl('div', 'font-size:0.72rem;color:var(--mp-text-muted)', statusLine));
            }
            container.append(wrap);
            return;
          }

          const head = subEl('div', SUB_ROW_CSS);
          const info = subEl('div', 'min-width:0;flex:1');
          info.append(
            subEl('div', 'font-size:0.79rem;font-weight:700', `${cfg.username}@${new URL(cfg.baseUrl).host}`),
            subEl('div', 'font-size:0.68rem;color:var(--mp-text-muted)', statusLine || 'Subsonic / Navidrome connected'),
          );
          head.append(
            info,
            subBtn('Disconnect', () => {
              client.clearConfig();
              songs = [];
              playlists = [];
              statusLine = '';
              void ctx.storage.remove(SUBSONIC_CONFIG_KEY).then(() => render());
            }),
          );
          wrap.append(head);

          const searchBar = subEl('div', 'display:flex;gap:0.35rem;flex-wrap:wrap');
          const qIn = subEl('input', `${SUB_INPUT_CSS};flex:1 1 8rem`);
          qIn.type = 'search';
          qIn.placeholder = 'Search Navidrome / Subsonic…';
          qIn.value = queryDraft;
          qIn.addEventListener('input', () => {
            queryDraft = qIn.value;
          });
          qIn.addEventListener('keydown', e => {
            if (e.key === 'Enter') void runSearch(false);
          });
          searchBar.append(
            qIn,
            subBtn(busy ? '…' : 'Search', () => void runSearch(false), 'solid'),
            subBtn('Random Mix', () => void runSearch(true), 'accent'),
          );
          wrap.append(searchBar);

          if (playlists.length > 0) {
            const plRow = subEl('div', 'display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center');
            plRow.append(subEl('span', 'font-size:0.69rem;color:var(--mp-text-muted)', 'Playlists:'));
            for (const pl of playlists.slice(0, 12)) {
              plRow.append(
                subBtn(
                  `${pl.name} (${pl.songCount})`,
                  () => {
                    void client
                      .getPlaylistSongs(pl.id)
                      .then(items => playSongs(items, pl.name))
                      .catch(err => ctx.notify(err instanceof Error ? err.message : 'Playlist error', 'error'));
                  },
                  'accent',
                ),
              );
            }
            wrap.append(plRow);
          }

          const list = subEl('div', 'display:flex;flex-direction:column;gap:0.28rem;max-height:13rem;overflow-y:auto');
          for (const song of songs) {
            const row = subEl('div', SUB_ROW_CSS);
            const meta = subEl('div', 'min-width:0;flex:1');
            meta.append(
              subEl('div', 'font-size:0.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', song.title),
              subEl('div', 'font-size:0.68rem;color:var(--mp-text-muted)', [song.artist, song.album, song.suffix?.toUpperCase()].filter(Boolean).join(' · ')),
            );
            row.append(meta, subBtn('Play', () => void playSongs([song], song.title), 'accent'));
            list.append(row);
          }
          wrap.append(list);

          container.append(wrap);
        };

        render();
        if (client.isConfigured()) {
          void refreshPlaylists().then(() => runSearch(true));
        }
        return () => {
          container.innerHTML = '';
        };
      },
    });
  },
};

export default plugin;
