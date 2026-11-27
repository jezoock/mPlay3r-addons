import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import {
  createLanClientMediaSourceProvider,
  RemoteLibraryClient,
  SavedServersStore,
} from './client';
import { LanHostController } from './host-bridge';
import type { LibraryPage, SharedPlaylist, SharedTrack } from './protocol';

export const manifest: PluginManifest = {
  id: 'mplay3r.library-share',
  name: 'Local Library Share (LAN)',
  version: '1.0.0',
  description:
    'Share selected local music folders over LAN with PIN/Bearer authentication, scannable QR code, embedded <mplay3r-app> web UI, HTTP 206 Range streaming, and a remote LAN client for Web & Desktop.',
  category: 'broadcast',
  permissions: ['network', 'local-server', 'playlist-write', 'playback-control', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let activeClient: RemoteLibraryClient | null = null;
let activeHostController: LanHostController | null = null;

const LAN_INPUT_CSS =
  'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.76rem';
const LAN_ROW_CSS =
  'display:flex;align-items:center;justify-content:space-between;gap:0.45rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';
const LAN_LIST_CSS = 'display:flex;flex-direction:column;gap:0.3rem;max-height:13rem;overflow-y:auto';

function lanEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function lanBtn(
  label: string,
  onClick: () => void,
  variant: 'ghost' | 'accent' | 'solid' = 'ghost',
): HTMLButtonElement {
  const styles: Record<'ghost' | 'accent' | 'solid', string> = {
    ghost:
      'padding:0.2rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:transparent;color:var(--mp-text);font-size:0.71rem;cursor:pointer',
    accent:
      'padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--mp-accent-soft);color:var(--ds-color-primary-base);font-size:0.71rem;font-weight:600;cursor:pointer',
    solid:
      'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer',
  };
  const btn = lanEl('button', styles[variant], label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const fetcher = (input: string | URL, init?: RequestInit) => ctx.fetch(input, init);
    const client = new RemoteLibraryClient(fetcher);
    const savedServers = new SavedServersStore(ctx.storage);
    const hostController = new LanHostController(ctx.storage);

    activeClient = client;
    activeHostController = hostController;

    await Promise.all([savedServers.load(), hostController.load()]);

    // Expose connected remote LAN library as an open MediaSourceProvider.
    ctx.registerProvider('media-source', createLanClientMediaSourceProvider(client));

    const playRemoteTracks = async (tracks: SharedTrack[], label: string) => {
      if (tracks.length === 0) return;
      const serverName = client.getSnapshot().serverInfo?.name || 'LAN Library';
      await ctx.playlist.clearPlaylist();
      await ctx.playlist.addTracks(
        tracks.map(t => ({
          src: client.getStreamUrl(t.id),
          title: t.title,
          artist: serverName,
          album: t.folder,
          format: t.format,
        })),
        true,
      );
      await ctx.notify(`Streaming ${label}`, 'success');
    };

    ctx.registerSlot({
      id: 'library-share-panel',
      slot: 'panel',
      title: 'LAN Share',
      mount(container) {
        let activeTab: 'client' | 'host' = 'client';
        let serverUrlInput = '';
        let pinInputVal = '';
        let tokenInputVal = '';
        let folderFilter = '';
        let searchQuery = '';
        let currentPage = 1;
        let libraryPage: LibraryPage | null = null;
        let playlists: SharedPlaylist[] = [];
        let busy = false;
        let folderPathDraft = '';

        const loadRemoteView = async () => {
          if (client.getSnapshot().state !== 'connected') {
            libraryPage = null;
            playlists = [];
            renderPanel();
            return;
          }
          busy = true;
          renderPanel();
          try {
            const [pageData, plData] = await Promise.all([
              client.listLibrary({
                folder: folderFilter,
                query: searchQuery,
                page: currentPage,
                limit: 25,
              }),
              client.listPlaylists().catch(() => [] as SharedPlaylist[]),
            ]);
            libraryPage = pageData;
            playlists = plData;
          } catch (err) {
            await ctx.notify(err instanceof Error ? err.message : 'LAN library request failed', 'error');
          } finally {
            busy = false;
            renderPanel();
          }
        };

        const connectServer = async (baseUrl: string, pin?: string, token?: string) => {
          busy = true;
          renderPanel();
          try {
            const { info, token: resolvedToken } = await client.connect({ baseUrl, pin, token });
            await savedServers.save({ baseUrl, name: info.name, token: resolvedToken });
            currentPage = 1;
            folderFilter = '';
            searchQuery = '';
            pinInputVal = '';
            await ctx.notify(`Connected to ${info.name}`, 'success');
            await loadRemoteView();
          } catch (err) {
            await ctx.notify(err instanceof Error ? err.message : 'Unable to connect to LAN server', 'error');
            busy = false;
            renderPanel();
          }
        };

        const renderClientTab = (wrap: HTMLElement) => {
          const snap = client.getSnapshot();

          if (snap.state !== 'connected') {
            const form = lanEl('form', 'display:flex;flex-wrap:wrap;gap:0.35rem');
            const urlField = lanEl('input', `${LAN_INPUT_CSS};flex:1 1 11rem`);
            urlField.type = 'url';
            urlField.placeholder = 'http://192.168.1.42:8765';
            urlField.value = serverUrlInput;
            urlField.addEventListener('input', () => {
              serverUrlInput = urlField.value;
            });

            const pinField = lanEl('input', `${LAN_INPUT_CSS};width:6.5rem`);
            pinField.type = 'password';
            pinField.placeholder = 'PIN';
            pinField.value = pinInputVal;
            pinField.addEventListener('input', () => {
              pinInputVal = pinField.value;
            });

            const tokField = lanEl('input', `${LAN_INPUT_CSS};flex:1 1 8rem`);
            tokField.type = 'password';
            tokField.placeholder = 'or Bearer token';
            tokField.value = tokenInputVal;
            tokField.addEventListener('input', () => {
              tokenInputVal = tokField.value;
            });

            const submitBtn = lanEl(
              'button',
              'padding:0.26rem 0.65rem;border-radius:999px;border:1px solid var(--ds-color-primary-base);background:var(--ds-color-primary-base);color:var(--mp-accent-contrast);font-size:0.73rem;font-weight:600;cursor:pointer',
              busy ? '…' : 'Connect',
            );
            submitBtn.type = 'submit';
            form.addEventListener('submit', e => {
              e.preventDefault();
              void connectServer(serverUrlInput, pinInputVal || undefined, tokenInputVal || undefined);
            });
            form.append(urlField, pinField, tokField, submitBtn);
            wrap.append(form);

            if (snap.lastError) {
              const errRow = lanEl('div', 'display:flex;align-items:center;justify-content:space-between;gap:0.4rem');
              errRow.append(lanEl('span', 'font-size:0.72rem;color:var(--mp-text-muted)', snap.lastError));
              if (snap.state === 'reconnecting') {
                errRow.append(
                  lanBtn('Retry', () => {
                    void client.ping().then(ok => {
                      if (ok) void loadRemoteView();
                      else renderPanel();
                    });
                  }, 'accent'),
                );
              }
              wrap.append(errRow);
            }

            const saved = savedServers.list();
            if (saved.length > 0) {
              const list = lanEl('div', LAN_LIST_CSS);
              for (const srv of saved) {
                const row = lanEl('div', LAN_ROW_CSS);
                const meta = lanEl('div', 'min-width:0;flex:1');
                meta.append(
                  lanEl('div', 'font-size:0.78rem;font-weight:600', srv.name),
                  lanEl('div', 'font-size:0.69rem;color:var(--mp-text-muted)', srv.baseUrl),
                );
                const btns = lanEl('div', 'display:flex;gap:0.25rem');
                btns.append(
                  lanBtn('✕', () => void savedServers.remove(srv.baseUrl).then(() => renderPanel())),
                  lanBtn('Connect', () => void connectServer(srv.baseUrl, undefined, srv.token), 'accent'),
                );
                row.append(meta, btns);
                list.append(row);
              }
              wrap.append(list);
            }
            return;
          }

          // Connected view
          const statusRow = lanEl('div', LAN_ROW_CSS);
          const infoBox = lanEl('div', 'min-width:0;flex:1');
          infoBox.append(
            lanEl('div', 'font-size:0.8rem;font-weight:700', snap.serverInfo?.name || 'Connected LAN Server'),
            lanEl(
              'div',
              'font-size:0.69rem;color:var(--mp-text-muted)',
              `${snap.baseUrl || ''} · ${snap.serverInfo?.trackCount ?? 0} tracks`,
            ),
          );
          statusRow.append(
            infoBox,
            lanBtn('Disconnect', () => {
              client.disconnect();
              libraryPage = null;
              playlists = [];
              renderPanel();
            }),
          );
          wrap.append(statusRow);

          const filterBar = lanEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem');
          const folderSel = lanEl('select', LAN_INPUT_CSS);
          folderSel.setAttribute('aria-label', 'Remote shared folder');
          const allOpt = document.createElement('option');
          allOpt.value = '';
          allOpt.textContent = 'All folders';
          allOpt.selected = folderFilter === '';
          folderSel.append(allOpt);
          for (const folder of libraryPage?.folders ?? []) {
            const opt = document.createElement('option');
            opt.value = folder;
            opt.textContent = folder;
            opt.selected = folder === folderFilter;
            folderSel.append(opt);
          }
          folderSel.addEventListener('change', () => {
            folderFilter = folderSel.value;
            currentPage = 1;
            void loadRemoteView();
          });

          const qInput = lanEl('input', `${LAN_INPUT_CSS};flex:1 1 8rem`);
          qInput.type = 'search';
          qInput.placeholder = 'Search remote tracks…';
          qInput.value = searchQuery;
          qInput.addEventListener('input', () => {
            searchQuery = qInput.value;
          });
          qInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              currentPage = 1;
              void loadRemoteView();
            }
          });

          filterBar.append(
            folderSel,
            qInput,
            lanBtn(busy ? '…' : 'Search', () => {
              currentPage = 1;
              void loadRemoteView();
            }, 'solid'),
          );
          wrap.append(filterBar);

          if (playlists.length > 0) {
            const plRow = lanEl('div', 'display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center');
            plRow.append(lanEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', 'Playlists:'));
            for (const pl of playlists) {
              plRow.append(
                lanBtn(`${pl.name} (${pl.trackCount})`, () => void playRemoteTracks(pl.tracks, pl.name), 'accent'),
              );
            }
            wrap.append(plRow);
          }

          const list = lanEl('div', LAN_LIST_CSS);
          const tracks = libraryPage?.tracks ?? [];
          if (tracks.length === 0) {
            list.append(lanEl('p', 'margin:0.3rem 0;font-size:0.75rem;color:var(--mp-text-muted)', 'No tracks found.'));
          } else {
            for (const track of tracks) {
              const row = lanEl('div', LAN_ROW_CSS);
              const meta = lanEl('div', 'min-width:0;flex:1');
              meta.append(
                lanEl(
                  'div',
                  'font-size:0.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
                  track.title,
                ),
                lanEl('div', 'font-size:0.68rem;color:var(--mp-text-muted)', `${track.folder} · ${track.format}`),
              );
              row.append(meta, lanBtn('Play', () => void playRemoteTracks([track], track.title), 'accent'));
              list.append(row);
            }
          }
          wrap.append(list);

          if (libraryPage && libraryPage.totalPages > 1) {
            const pager = lanEl('div', 'display:flex;align-items:center;justify-content:space-between;font-size:0.72rem');
            const prevBtn = lanBtn('← Prev', () => {
              if (currentPage > 1) {
                currentPage -= 1;
                void loadRemoteView();
              }
            });
            prevBtn.disabled = currentPage <= 1;
            const nextBtn = lanBtn('Next →', () => {
              if (libraryPage && currentPage < libraryPage.totalPages) {
                currentPage += 1;
                void loadRemoteView();
              }
            });
            nextBtn.disabled = currentPage >= libraryPage.totalPages;
            pager.append(prevBtn, lanEl('span', 'color:var(--mp-text-muted)', `Page ${libraryPage.page}/${libraryPage.totalPages}`), nextBtn);
            wrap.append(pager);
          }
        };

        const renderHostTab = (wrap: HTMLElement) => {
          const st = hostController.getStatus();

          const folderForm = lanEl('form', 'display:flex;gap:0.35rem');
          const pathInput = lanEl('input', `${LAN_INPUT_CSS};flex:1`);
          pathInput.type = 'text';
          pathInput.placeholder = 'Add allowlisted folder path (e.g. /home/user/Music)';
          pathInput.value = folderPathDraft;
          pathInput.addEventListener('input', () => {
            folderPathDraft = pathInput.value;
          });
          const addBtn = lanEl('button', `${LAN_INPUT_CSS};cursor:pointer`, '+ Folder');
          addBtn.type = 'submit';
          folderForm.addEventListener('submit', e => {
            e.preventDefault();
            const val = folderPathDraft.trim();
            if (!val) return;
            folderPathDraft = '';
            void hostController
              .addSharedFolder(val)
              .then(() => renderPanel())
              .catch(err => ctx.notify(err instanceof Error ? err.message : 'Invalid folder', 'error'));
          });
          folderForm.append(pathInput, addBtn);
          wrap.append(folderForm);

          const folderList = lanEl('div', 'display:flex;flex-direction:column;gap:0.25rem');
          if (st.sharedFolders.length === 0) {
            folderList.append(
              lanEl(
                'div',
                'font-size:0.73rem;color:var(--mp-text-muted)',
                'No folders shared yet. Only explicitly allowlisted folders are ever exposed.',
              ),
            );
          } else {
            for (const dir of st.sharedFolders) {
              const row = lanEl('div', LAN_ROW_CSS);
              row.append(
                lanEl('span', 'font-size:0.74rem;overflow:hidden;text-overflow:ellipsis', dir),
                lanBtn('Remove', () => void hostController.removeSharedFolder(dir).then(() => renderPanel())),
              );
              folderList.append(row);
            }
          }
          wrap.append(folderList);

          const ctrlRow = lanEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center');
          ctrlRow.append(
            lanBtn(
              st.running ? 'Stop LAN Server' : 'Start LAN Server',
              () => {
                if (st.running) {
                  void hostController.stop().then(() => renderPanel());
                } else {
                  void hostController
                    .start()
                    .then(() => ctx.notify('LAN Library Share server started', 'success'))
                    .catch(err => ctx.notify(err instanceof Error ? err.message : 'Start failed', 'error'))
                    .finally(() => renderPanel());
                }
              },
              st.running ? 'accent' : 'solid',
            ),
            lanBtn('Rotate PIN', () => void hostController.rotateCredentials().then(() => renderPanel())),
            lanEl('span', 'font-size:0.74rem;font-weight:700', `PIN: ${st.pin}`),
          );
          wrap.append(ctrlRow);

          const qr = hostController.getPairingQr();
          const qrBox = lanEl(
            'div',
            'display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;padding:0.45rem;border:1px solid var(--mp-border);border-radius:6px;background:var(--mp-bg)',
          );
          const qrImg = lanEl('div', 'line-height:0;border-radius:6px;overflow:hidden');
          qrImg.innerHTML = qr.svg;
          const qrMeta = lanEl('div', 'flex:1;min-width:10rem;display:flex;flex-direction:column;gap:0.25rem;font-size:0.72rem');
          qrMeta.append(
            lanEl('div', 'font-weight:600', st.running ? `Live at ${st.url}` : 'Quick-connect QR (LAN)'),
            lanEl('div', 'color:var(--mp-text-muted);word-break:break-all', qr.connectUrl),
          );
          if (!st.supported && st.cliCommand) {
            qrMeta.append(
              lanEl(
                'code',
                'font-size:0.67rem;padding:0.25rem 0.35rem;border-radius:4px;border:1px solid var(--mp-border);word-break:break-all',
                st.cliCommand,
              ),
            );
          }
          qrBox.append(qrImg, qrMeta);
          wrap.append(qrBox);
        };

        const renderPanel = () => {
          container.innerHTML = '';
          const wrap = lanEl('div', 'display:flex;flex-direction:column;gap:0.5rem');

          const tabs = lanEl('div', 'display:flex;gap:0.35rem');
          tabs.append(
            lanBtn('Remote Client', () => {
              activeTab = 'client';
              renderPanel();
            }, activeTab === 'client' ? 'solid' : 'ghost'),
            lanBtn('Share Local Library', () => {
              activeTab = 'host';
              renderPanel();
            }, activeTab === 'host' ? 'solid' : 'ghost'),
          );
          wrap.append(tabs);

          if (activeTab === 'client') {
            renderClientTab(wrap);
          } else {
            renderHostTab(wrap);
          }

          container.append(wrap);
        };

        const unsub = client.onStateChange(() => renderPanel());
        renderPanel();
        return () => {
          unsub();
          container.innerHTML = '';
        };
      },
    });
  },

  async deactivate(): Promise<void> {
    activeClient?.disconnect();
    activeClient = null;
    if (activeHostController?.getStatus().running) {
      await activeHostController.stop().catch(() => undefined);
    }
    activeHostController = null;
  },
};

export default plugin;
