import type { MPlay3rPlugin, PluginContext, PluginManifest } from '../../../sdk/types';
import { IcecastPushController, validateIcecastConfig } from './icecast';
import type { IcecastPushConfig } from './icecast';
import { BroadcastHostStateManager, SseBroadcastListener } from './sync';
import type { BroadcastTrackMeta } from './sync';
import { WebRtcBroadcastHost, WebRtcBroadcastListener } from './webrtc';
import type { MediaStreamLike } from './webrtc';

export const manifest: PluginManifest = {
  id: 'mplay3r.live-broadcast',
  name: 'Live Broadcast & Listening Party',
  version: '1.0.0',
  description:
    'Stream live playback to synchronized listeners over LAN/SSE (with latency compensation, listener counter, session token & optional Icecast push) or P2P WebRTC directly from Web Audio.',
  category: 'broadcast',
  permissions: ['audio-context', 'network', 'local-server', 'playlist-write', 'playback-control', 'ui-slot', 'storage'],
  minCoreVersion: '0.1.0',
  author: 'jezoock',
  homepage: 'https://github.com/jezoock/mPlay3r-addons',
  runtime: 'all',
};

let activeSseListener: SseBroadcastListener | null = null;
let activeRtcHost: WebRtcBroadcastHost | null = null;
let activeRtcListener: WebRtcBroadcastListener | null = null;
let activeIcecast: IcecastPushController | null = null;
let activeRemoteAudioEl: HTMLAudioElement | null = null;

const BC_INPUT_CSS =
  'padding:0.28rem 0.5rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg);color:var(--mp-text);font-size:0.75rem';
const BC_CARD_CSS =
  'display:flex;flex-direction:column;gap:0.35rem;padding:0.45rem 0.55rem;border-radius:6px;border:1px solid var(--mp-border);background:var(--mp-bg)';

function bcEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bcBtn(
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
  const btn = bcEl('button', styles[variant], label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function cleanupRemoteAudio(): void {
  if (activeRemoteAudioEl) {
    activeRemoteAudioEl.pause();
    activeRemoteAudioEl.srcObject = null;
    activeRemoteAudioEl = null;
  }
}

export const plugin: MPlay3rPlugin = {
  manifest,

  async activate(ctx: PluginContext): Promise<void> {
    const fetcher = (input: string | URL, init?: RequestInit) => ctx.fetch(input, init);
    const savedToken = await ctx.storage.get<string>('broadcastSessionToken');
    const hostManager = new BroadcastHostStateManager({
      token: typeof savedToken === 'string' && savedToken.length >= 8 ? savedToken : undefined,
    });
    await ctx.storage.set('broadcastSessionToken', hostManager.getToken());

    const icecast = new IcecastPushController(fetcher);
    activeIcecast = icecast;

    let hostingSseUrl = '';
    let hostingSseActive = false;
    let lastPushedPosition = -1;
    let badgeEl: HTMLElement | null = null;
    let rerenderPanel: (() => void) | null = null;

    const rtcHost = new WebRtcBroadcastHost({
      sessionId: hostManager.sessionId,
      token: hostManager.getToken(),
      onPeerCountChange: () => {
        renderBadge();
        rerenderPanel?.();
      },
    });
    activeRtcHost = rtcHost;

    const rtcListener = new WebRtcBroadcastListener({
      onRemoteStream: (stream: MediaStreamLike) => {
        if (typeof Audio !== 'undefined') {
          cleanupRemoteAudio();
          const audio = new Audio();
          audio.srcObject = stream as unknown as MediaStream;
          void audio.play().catch(() => undefined);
          activeRemoteAudioEl = audio;
        }
        renderBadge();
        rerenderPanel?.();
      },
    });
    activeRtcListener = rtcListener;

    const sseListener = new SseBroadcastListener(
      {
        async loadTrack(track: BroadcastTrackMeta) {
          await ctx.playlist.clearPlaylist();
          await ctx.playlist.addTracks(
            [
              {
                id: track.id,
                src: track.streamUrl,
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration,
                format: track.format,
              },
            ],
            false,
          );
        },
        play: () => ctx.playback.play(),
        pause: () => ctx.playback.pause(),
        stop: () => ctx.playback.stop(),
        seek: seconds => ctx.playback.seek(seconds),
        getLocalState() {
          const snap = ctx.getState();
          return {
            trackId: snap.currentTrack?.id ?? null,
            trackSrc: snap.currentTrack?.src ?? null,
            status: snap.status,
            currentTime: snap.currentTime,
          };
        },
      },
      {
        onUpdate: () => {
          renderBadge();
          rerenderPanel?.();
        },
      },
    );
    activeSseListener = sseListener;

    const pushHostStateToServer = async () => {
      if (!hostingSseActive || !hostingSseUrl) return;
      try {
        const clean = hostingSseUrl.replace(/\/+$/, '');
        await fetcher(`${clean}/api/broadcast/state`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${hostManager.getToken()}`,
          },
          body: JSON.stringify(hostManager.getState()),
        });
      } catch {
        // Non-fatal: keep local host state updated for next push.
      }
    };

    const renderBadge = () => {
      if (!badgeEl) return;
      const isHost = hostingSseActive || rtcHost.isBroadcasting() || icecast.isStreaming();
      const isListener = sseListener.isConnected() || rtcListener.isConnected();
      if (!isHost && !isListener) {
        badgeEl.textContent = '';
        badgeEl.style.display = 'none';
        return;
      }

      badgeEl.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.72rem';
      badgeEl.innerHTML = '';

      const pill = bcEl(
        'span',
        'padding:0.1rem 0.45rem;border-radius:999px;font-weight:700;font-size:0.66rem;background:var(--ds-color-primary-base);color:var(--mp-accent-contrast)',
        isHost ? 'ON AIR' : 'PARTY SYNC',
      );
      const listeners = hostManager.getListenerCount() + rtcHost.getPeerCount();
      const detail = isHost
        ? `${listeners} listener${listeners === 1 ? '' : 's'}${rtcHost.isBroadcasting() ? ' · WebRTC P2P' : ''}`
        : rtcListener.isConnected()
          ? `P2P · ${rtcListener.getHostName()}`
          : `Synced · ${sseListener.getLastState()?.listenerCount ?? 1} online`;
      badgeEl.append(pill, bcEl('span', 'color:var(--mp-text-muted)', detail));
    };

    ctx.on('stateChange', snap => {
      if (!hostingSseActive) return;
      const status = snap.status === 'playing' || snap.status === 'paused' ? snap.status : 'stopped';
      hostManager.updateFromHost({
        status,
        track: snap.currentTrack,
        positionSeconds: snap.currentTime,
      });
      lastPushedPosition = snap.currentTime;
      void pushHostStateToServer();
    });

    ctx.on('trackChange', ({ track }) => {
      if (!hostingSseActive) return;
      const snap = ctx.getState();
      const status = snap.status === 'playing' || snap.status === 'paused' ? snap.status : 'stopped';
      hostManager.updateFromHost({ status, track, positionSeconds: 0 });
      lastPushedPosition = 0;
      void pushHostStateToServer();
    });

    ctx.on('timeUpdate', ({ currentTime }) => {
      if (!hostingSseActive) return;
      // Push seek jumps (> 2s) immediately without spamming normal 250ms ticks.
      if (Math.abs(currentTime - lastPushedPosition) > 2) {
        lastPushedPosition = currentTime;
        hostManager.updateFromHost({ positionSeconds: currentTime });
        void pushHostStateToServer();
      } else {
        lastPushedPosition = currentTime;
      }
    });

    ctx.registerSlot({
      id: 'broadcast-status-badge',
      slot: 'track-info',
      mount(container) {
        badgeEl = container;
        renderBadge();
        return () => {
          badgeEl = null;
        };
      },
    });

    ctx.registerSlot({
      id: 'live-broadcast-panel',
      slot: 'panel',
      title: 'Live Broadcast',
      mount(container) {
        let activeTab: 'host' | 'join' | 'p2p' = 'host';
        let joinUrlDraft = '';
        let joinTokenDraft = '';
        let offerDraft = '';
        let answerDraft = '';
        let generatedOfferCode = '';
        let generatedAnswerCode = '';
        let icecastUrl = '';
        let icecastMount = '/mplay3r.ogg';
        let icecastPass = '';

        const renderPanel = () => {
          container.innerHTML = '';
          const wrap = bcEl('div', 'display:flex;flex-direction:column;gap:0.5rem');

          const tabs = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem');
          tabs.append(
            bcBtn('Host (SSE / Icecast)', () => {
              activeTab = 'host';
              renderPanel();
            }, activeTab === 'host' ? 'solid' : 'ghost'),
            bcBtn('Join Party', () => {
              activeTab = 'join';
              renderPanel();
            }, activeTab === 'join' ? 'solid' : 'ghost'),
            bcBtn('Web P2P (WebRTC)', () => {
              activeTab = 'p2p';
              renderPanel();
            }, activeTab === 'p2p' ? 'solid' : 'ghost'),
          );
          wrap.append(tabs);

          if (activeTab === 'host') {
            const sseCard = bcEl('div', BC_CARD_CSS);
            sseCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'LAN / Reverse-Proxy Listening Party (SSE)'));
            const urlInput = bcEl('input', BC_INPUT_CSS);
            urlInput.type = 'url';
            urlInput.placeholder = 'Companion server URL (e.g. http://192.168.1.42:8765)';
            urlInput.value = hostingSseUrl;
            urlInput.addEventListener('input', () => {
              hostingSseUrl = urlInput.value;
            });

            const row = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center');
            row.append(
              bcBtn(
                hostingSseActive ? 'Stop Hosting' : 'Start SSE Sync',
                () => {
                  if (hostingSseActive) {
                    hostingSseActive = false;
                  } else {
                    if (!/^https?:\/\/\S+/i.test(hostingSseUrl.trim())) {
                      void ctx.notify('Enter a valid companion server URL first.', 'warning');
                      return;
                    }
                    hostingSseActive = true;
                    const snap = ctx.getState();
                    hostManager.updateFromHost({
                      status: snap.status === 'playing' || snap.status === 'paused' ? snap.status : 'stopped',
                      track: snap.currentTrack,
                      positionSeconds: snap.currentTime,
                    });
                    void pushHostStateToServer();
                  }
                  renderBadge();
                  renderPanel();
                },
                hostingSseActive ? 'accent' : 'solid',
              ),
              bcBtn('Rotate Token', () => {
                const next = hostManager.rotateToken();
                void ctx.storage.set('broadcastSessionToken', next).then(() => renderPanel());
              }),
              bcEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', `Token: ${hostManager.getToken().slice(0, 12)}…`),
            );
            sseCard.append(urlInput, row);

            const iceCard = bcEl('div', BC_CARD_CSS);
            iceCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Optional Icecast 2.4+ Source Push'));
            const iceRow = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.3rem');
            const iceUrlIn = bcEl('input', `${BC_INPUT_CSS};flex:1 1 9rem`);
            iceUrlIn.placeholder = 'http://icecast.local:8000';
            iceUrlIn.value = icecastUrl;
            iceUrlIn.addEventListener('input', () => {
              icecastUrl = iceUrlIn.value;
            });
            const iceMountIn = bcEl('input', `${BC_INPUT_CSS};width:7rem`);
            iceMountIn.placeholder = '/mplay3r.ogg';
            iceMountIn.value = icecastMount;
            iceMountIn.addEventListener('input', () => {
              icecastMount = iceMountIn.value;
            });
            const icePassIn = bcEl('input', `${BC_INPUT_CSS};width:7rem`);
            icePassIn.type = 'password';
            icePassIn.placeholder = 'Source pass';
            icePassIn.value = icecastPass;
            icePassIn.addEventListener('input', () => {
              icecastPass = icePassIn.value;
            });
            iceRow.append(
              iceUrlIn,
              iceMountIn,
              icePassIn,
              bcBtn('Validate Icecast', () => {
                const cfg: IcecastPushConfig = {
                  serverUrl: icecastUrl,
                  mountpoint: icecastMount,
                  password: icecastPass,
                };
                const res = validateIcecastConfig(cfg);
                void ctx.notify(
                  res.valid ? `Icecast target ready: ${res.targetUrl}` : res.errors.join(' · '),
                  res.valid ? 'success' : 'error',
                );
              }, 'accent'),
            );
            iceCard.append(iceRow);
            wrap.append(sseCard, iceCard);
          } else if (activeTab === 'join') {
            const joinCard = bcEl('div', BC_CARD_CSS);
            joinCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Join Synchronized Listening Party'));
            const uIn = bcEl('input', BC_INPUT_CSS);
            uIn.type = 'url';
            uIn.placeholder = 'Host URL (e.g. http://192.168.1.42:8765)';
            uIn.value = joinUrlDraft;
            uIn.addEventListener('input', () => {
              joinUrlDraft = uIn.value;
            });
            const tIn = bcEl('input', BC_INPUT_CSS);
            tIn.type = 'password';
            tIn.placeholder = 'Session token';
            tIn.value = joinTokenDraft;
            tIn.addEventListener('input', () => {
              joinTokenDraft = tIn.value;
            });

            const btnRow = bcEl('div', 'display:flex;gap:0.35rem;align-items:center');
            btnRow.append(
              bcBtn(
                sseListener.isConnected() ? 'Leave Party' : 'Join via SSE',
                () => {
                  if (sseListener.isConnected()) {
                    sseListener.close();
                  } else {
                    try {
                      sseListener.connect(joinUrlDraft, joinTokenDraft);
                      void ctx.notify('Connected to live listening party', 'success');
                    } catch (err) {
                      void ctx.notify(err instanceof Error ? err.message : 'Unable to join party', 'error');
                    }
                  }
                  renderBadge();
                  renderPanel();
                },
                sseListener.isConnected() ? 'accent' : 'solid',
              ),
              bcEl(
                'span',
                'font-size:0.7rem;color:var(--mp-text-muted)',
                sseListener.isConnected()
                  ? `Latency comp: ${sseListener.getOneWayLatencyMs()}ms`
                  : 'Syncs play, pause, seek & track changes automatically.',
              ),
            );
            joinCard.append(uIn, tIn, btnRow);
            wrap.append(joinCard);
          } else {
            const hostCard = bcEl('div', BC_CARD_CSS);
            hostCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Host WebRTC P2P Audio (Zero Media Server)'));
            const hostBtns = bcEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center');
            hostBtns.append(
              bcBtn(
                rtcHost.isBroadcasting() ? 'Stop P2P Broadcast' : 'Capture Audio & Start P2P',
                () => {
                  if (rtcHost.isBroadcasting()) {
                    rtcHost.stop();
                    generatedOfferCode = '';
                    renderBadge();
                    renderPanel();
                    return;
                  }
                  void (async () => {
                    const audioCtx = await ctx.getAudioContext();
                    const analyser = await ctx.getAudioAnalyser();
                    if (!audioCtx) {
                      await ctx.notify('Start playing audio first to initialize the Web Audio graph.', 'warning');
                      return;
                    }
                    rtcHost.startCapture(
                      audioCtx as unknown as { createMediaStreamDestination(): { stream: MediaStreamLike } & AudioNode },
                      analyser,
                    );
                    const { offerCode } = await rtcHost.createListenerOffer();
                    generatedOfferCode = offerCode;
                    renderBadge();
                    renderPanel();
                  })();
                },
                rtcHost.isBroadcasting() ? 'accent' : 'solid',
              ),
              bcEl('span', 'font-size:0.7rem;color:var(--mp-text-muted)', `Peers: ${rtcHost.getPeerCount()}`),
            );
            hostCard.append(hostBtns);

            if (generatedOfferCode) {
              const offerOut = bcEl('textarea', `${BC_INPUT_CSS};min-height:3rem;font-family:monospace`);
              offerOut.readOnly = true;
              offerOut.value = generatedOfferCode;
              const ansRow = bcEl('div', 'display:flex;gap:0.3rem');
              const ansIn = bcEl('input', `${BC_INPUT_CSS};flex:1`);
              ansIn.placeholder = 'Paste listener answer code…';
              ansIn.value = answerDraft;
              ansIn.addEventListener('input', () => {
                answerDraft = ansIn.value;
              });
              ansRow.append(
                ansIn,
                bcBtn('Accept Answer', () => {
                  void rtcHost
                    .acceptListenerAnswer(answerDraft)
                    .then(() => {
                      answerDraft = '';
                      void ctx.notify('Listener connected via WebRTC P2P!', 'success');
                      renderPanel();
                    })
                    .catch(err => ctx.notify(err instanceof Error ? err.message : 'Invalid answer', 'error'));
                }, 'accent'),
              );
              hostCard.append(offerOut, ansRow);
            }

            const listenCard = bcEl('div', BC_CARD_CSS);
            listenCard.append(bcEl('div', 'font-size:0.78rem;font-weight:700', 'Listen via WebRTC P2P'));
            const offRow = bcEl('div', 'display:flex;gap:0.3rem');
            const offIn = bcEl('input', `${BC_INPUT_CSS};flex:1`);
            offIn.placeholder = 'Paste host WebRTC offer code…';
            offIn.value = offerDraft;
            offIn.addEventListener('input', () => {
              offerDraft = offIn.value;
            });
            offRow.append(
              offIn,
              bcBtn(
                rtcListener.isConnected() ? 'Disconnect' : 'Join P2P',
                () => {
                  if (rtcListener.isConnected()) {
                    rtcListener.disconnect();
                    cleanupRemoteAudio();
                    generatedAnswerCode = '';
                    renderBadge();
                    renderPanel();
                    return;
                  }
                  void rtcListener
                    .joinWithOffer(offerDraft)
                    .then(({ answerCode }) => {
                      generatedAnswerCode = answerCode;
                      void ctx.notify('Answer generated — send it back to the host!', 'success');
                      renderBadge();
                      renderPanel();
                    })
                    .catch(err => ctx.notify(err instanceof Error ? err.message : 'Invalid offer', 'error'));
                },
                rtcListener.isConnected() ? 'accent' : 'solid',
              ),
            );
            listenCard.append(offRow);
            if (generatedAnswerCode) {
              const ansOut = bcEl('textarea', `${BC_INPUT_CSS};min-height:3rem;font-family:monospace`);
              ansOut.readOnly = true;
              ansOut.value = generatedAnswerCode;
              listenCard.append(ansOut);
            }
            wrap.append(hostCard, listenCard);
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
  },

  deactivate(): void {
    activeSseListener?.close();
    activeSseListener = null;
    activeRtcHost?.stop();
    activeRtcHost = null;
    activeRtcListener?.disconnect();
    activeRtcListener = null;
    activeIcecast?.stop();
    activeIcecast = null;
    cleanupRemoteAudio();
  },
};

export default plugin;
