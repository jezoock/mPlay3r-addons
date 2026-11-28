# mPlay3r Addons & Official Plugin Registry

Official repository of lightweight, zero-dependency plugins, ISP-box micro-plugins, and themes for **[mPlay3r](https://github.com/jezoock/mPlay3r)**, published through a **SHA-256 verified JSON registry** (`registry.json`).

## Registry URL (configured by default in `<mp-store>`)

```text
https://raw.githubusercontent.com/jezoock/mPlay3r-addons/main/registry.json
```

## Available Addons

| ID | Category | Description |
| :--- | :--- | :--- |
| `mplay3r.dsp-enhancer` | `dsp` | AudioWorklet DSP effect chained on `getAudioContext()` (harmonic Bass Enhancer, Mid/Side Stereo Widener, native Biquad fallback & lossless Bypass). |
| `mplay3r.library-share` | `broadcast` | Local LAN library sharing (explicit folder allowlist, PIN/Bearer auth, scannable QR code SVG, embedded `<mplay3r-app>` web UI, HTTP 206 Range streaming) + remote LAN client for Web & Desktop (`companion/lan-server/` zero-dep Rust micro-server included). |
| `mplay3r.live-broadcast` | `broadcast` | Live Listening Party & audio broadcast: synchronized LAN/SSE host & listener (latency drift compensation, listener count, token auth, optional Icecast 2.4+ push) + serverless Web P2P WebRTC capturing `AudioContext` via `MediaStreamAudioDestinationNode`. |
| `mplay3r.podcasts` | `source` | RSS/Atom podcasts (iTunes & Podcast Index search), streaming platform link resolution (Apple Podcasts, Spotify, HTML RSS autodiscovery), per-episode resume, playback speed (`0.75×`–`2×`), `-15s / +30s` skips, chapters, offline downloads, and `MediaSourceProvider` discovery. |
| `mplay3r.radio` | `source` | Web & FM/DAB+ IP radios via Radio Browser, direct Icecast/SHOUTcast/HLS streams, `LIVE` badge, auto-reconnect, ICY `StreamTitle` metadata, favorites, and extensible `RadioProvider` discovery. |
| `mplay3r.radio-bbox` | `source` | Bouygues Bbox micro-plugin implementing `RadioProvider` (local Bbox M3U radio bouquet + French FM/DAB+ IP stream fallback). |
| `mplay3r.radio-freebox` | `source` | Freebox multiposte micro-plugin implementing `RadioProvider` (filters Freebox M3U radio channels + French public FM IP stream fallback). |
| `mplay3r.radio-livebox` | `source` | Orange Livebox micro-plugin implementing `RadioProvider` (local Livebox M3U radio bouquet + French FM/DAB+ IP stream fallback). |
| `mplay3r.radio-sfr` | `source` | SFR Box / Neufbox micro-plugin implementing `RadioProvider` (multiposte radio channels + French FM/DAB+ IP stream fallback). |
| `mplay3r.scraper` | `scraper` | 100% opt-in metadata enrichment on `trackChange`: HD cover art (MusicBrainz + Cover Art Archive), synced `.lrc` lyrics (LRCLIB), persistent LRU/TTL cache, polite rate limiting & offline resilience. |
| `mplay3r.source-subsonic` | `source` | OpenSubsonic / Subsonic / Navidrome / Airsonic self-hosted server connector with zero-dependency RFC 1321 salted MD5 authentication (`t = md5(password + salt)`), search, playlists, random mixes, and `MediaSourceProvider`. |
| `mplay3r.theme-classic` | `theme` | Full-layout structural themes built with `registerTheme()` and `<ds-trigger>`: *Winamp Classic 2.x* beveled deck and brushed *Hi-Fi Rack* component with zero-interruption hot switching. |
| `mplay3r.theme-cyberpunk-jukebox` | `theme` | High-impact visual *Cyberpunk Neon Jukebox* structural theme: glowing cyan/magenta arch, spinning holographic cyber-disc with laser arm, live Canvas 2D FFT neon spectrum on `getAudioAnalyser()`, backlit `A1`–`D4` track selector grid, and frameless desktop drag/window controls. |
| `mplay3r.theme-ember-noir` | `theme` | Matte charcoal *Ember Noir* dark-neumorphic structural theme: circular smoldering obsidian-rose medallion, fiery ember-orange Play/Pause button, ember-to-gold scrubber with glowing amber dot, switchable Now Playing / Tracklist / Dual-Card views, favorites persistence, and frameless desktop drag/window controls. |
| `mplay3r.theme-neumorph` | `theme` | Tactile *Soft Studio Neumorphism* structural theme with sculpted dual-shadow controls, concave LCD cavity, Porcelain Light / Graphite Dark toggle persisted in storage, and frameless desktop drag/window controls. |
| `mplay3r.theme-prism-glass` | `theme` | Luminous periwinkle & orchid *Prism Glass* glassmorphism structural theme: frosted translucent cards with crisp white rims, squircle-in-squircle artwork frame, double-ring glass buttons, coral-red Play/Pause, white/coral-dot scrubber (`-m:ss`), `Collections` & `Recommended` library with floating frosted mini-player, and frameless desktop drag/window controls. |
| `mplay3r.theme-seventies` | `theme` | *1970s Vintage Hi-Fi* stereo receiver structural theme: walnut woodgrain side cheeks, brushed champagne aluminum faceplate, dual glowing analog VU meter needles driven by `getAudioAnalyser()`, warm amber/turquoise dial, and frameless desktop drag/window controls. |
| `mplay3r.visualizers` | `visualizer` | Audio-reactive visualizers on `getAudioAnalyser()`: Winamp LED spectrum analyzer with peak-hold, zero-crossing oscilloscope, WebGL GLSL shader, and fullscreen toggle. |
| `mplay3r.wsz-skins` | `theme` | Zero-dependency Winamp `.wsz` skin archive loader (local file or URL): Stored/Deflate ZIP extraction, `pledit.txt` & `viscolor.txt` parsers, BMP sprite slicing (`main.bmp`, `cbuttons.bmp`, `eqmain.bmp`) & interactive `<ds-trigger>` deck. |

## Scripts

```bash
npm run build:registry                                       # Compiles plugins/*/src -> dist/*.js and regenerates registry.json with SHA-256 digests
npm run check:registry                                       # Verifies every dist/*.js bundle matches its SHA-256 in registry.json and loads cleanly
npm test                                                     # Runs zero-dependency Node 22 unit tests
npm run typecheck                                            # TypeScript strict type checking
npm run lint                                                 # ESLint
cargo test --manifest-path companion/lan-server/Cargo.toml   # Runs zero-dependency Rust LAN server security & Range tests
```