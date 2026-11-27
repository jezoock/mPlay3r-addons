# mPlay3r Addons & Official Plugin Registry

Official repository of lightweight, zero-dependency plugins, ISP-box micro-plugins, and themes for **[mPlay3r](https://github.com/jezoock/mPlay3r)**, published through a **SHA-256 verified JSON registry** (`registry.json`).

## Registry URL (configured by default in `<mp-store>`)

```text
https://raw.githubusercontent.com/jezoock/mPlay3r-addons/main/registry.json
```

## Available Addons

| ID | Category | Description |
| :--- | :--- | :--- |
| `mplay3r.library-share` | `broadcast` | Local LAN library sharing (explicit folder allowlist, PIN/Bearer auth, scannable QR code SVG, embedded `<mplay3r-app>` web UI, HTTP 206 Range streaming) + remote LAN client for Web & Desktop (`companion/lan-server/` zero-dep Rust micro-server included). |
| `mplay3r.live-broadcast` | `broadcast` | Live Listening Party & audio broadcast: synchronized LAN/SSE host & listener (latency drift compensation, listener count, token auth, optional Icecast 2.4+ push) + serverless Web P2P WebRTC capturing `AudioContext` via `MediaStreamAudioDestinationNode`. |
| `mplay3r.podcasts` | `source` | RSS/Atom podcasts (iTunes & Podcast Index search), streaming platform link resolution (Apple Podcasts, Spotify, HTML RSS autodiscovery), per-episode resume, playback speed (`0.75×`–`2×`), `-15s / +30s` skips, chapters, offline downloads, and `MediaSourceProvider` discovery. |
| `mplay3r.radio` | `source` | Web & FM/DAB+ IP radios via Radio Browser, direct Icecast/SHOUTcast/HLS streams, `LIVE` badge, auto-reconnect, ICY `StreamTitle` metadata, favorites, and extensible `RadioProvider` discovery. |
| `mplay3r.radio-freebox` | `source` | Freebox multiposte micro-plugin implementing `RadioProvider` (filters Freebox M3U radio channels + French public FM IP stream fallback). |

## Scripts

```bash
npm run build:registry                                       # Compiles plugins/*/src -> dist/*.js and regenerates registry.json with SHA-256 digests
npm run check:registry                                       # Verifies every dist/*.js bundle matches its SHA-256 in registry.json and loads cleanly
npm test                                                     # Runs zero-dependency Node 22 unit tests
npm run typecheck                                            # TypeScript strict type checking
npm run lint                                                 # ESLint
cargo test --manifest-path companion/lan-server/Cargo.toml   # Runs zero-dependency Rust LAN server security & Range tests
```