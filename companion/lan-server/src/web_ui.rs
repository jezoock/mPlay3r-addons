/// Escapes HTML special characters for safe embedding in the LAN web UI.
pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Renders the lightweight LAN web page served automatically at `GET /`.
/// Embeds `<mplay3r-app>` directly (with a zero-dependency native audio fallback when offline on LAN)
/// so any phone or desktop on the local network can unlock via PIN and stream the shared library.
pub fn render_embedded_web_client(server_name: &str) -> String {
    let safe_name = escape_html(server_name);
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{safe_name} — mPlay3r LAN Library</title>
  <style>
    :root {{ color-scheme: dark; --bg:#0f1117; --card:#171a23; --border:#2a2f3d; --text:#f3f4f6; --muted:#9ca3af; --accent:#22d3ee; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); padding:1rem; max-width:52rem; margin-inline:auto; }}
    header {{ display:flex; align-items:center; justify-content:space-between; gap:0.75rem; margin-bottom:1rem; }}
    h1 {{ margin:0; font-size:1.1rem; }}
    .card {{ background:var(--card); border:1px solid var(--border); border-radius:10px; padding:0.9rem; margin-bottom:0.85rem; }}
    .row {{ display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; }}
    input,select,button {{ font:inherit; font-size:0.86rem; padding:0.45rem 0.65rem; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); }}
    button.primary {{ background:var(--accent); color:#0b1116; border-color:var(--accent); font-weight:700; cursor:pointer; }}
    button {{ cursor:pointer; }}
    ul {{ list-style:none; margin:0.6rem 0 0; padding:0; display:flex; flex-direction:column; gap:0.35rem; }}
    li {{ display:flex; align-items:center; justify-content:space-between; gap:0.6rem; padding:0.45rem 0.6rem; border:1px solid var(--border); border-radius:8px; }}
    .muted {{ color:var(--muted); font-size:0.78rem; }}
    audio {{ width:100%; margin-top:0.5rem; }}
  </style>
</head>
<body>
  <header>
    <h1>{safe_name}</h1>
    <span class="muted">mPlay3r LAN Share</span>
  </header>

  <section id="auth-box" class="card">
    <form id="pin-form" class="row">
      <input id="pin-input" type="password" inputmode="numeric" placeholder="Enter LAN PIN" autocomplete="one-time-code" required />
      <button type="submit" class="primary">Unlock Library</button>
      <span id="auth-err" class="muted"></span>
    </form>
  </section>

  <section id="player-box" class="card" hidden>
    <mplay3r-app id="lan-player" palette="obsidian" compact="true"></mplay3r-app>
    <div id="fallback-player">
      <div id="now-playing" class="muted">Select a track to start streaming</div>
      <audio id="audio-el" controls preload="metadata"></audio>
    </div>
  </section>

  <section id="browser-box" class="card" hidden>
    <div class="row">
      <select id="folder-select" aria-label="Shared folder"></select>
      <input id="search-input" type="search" placeholder="Filter tracks…" style="flex:1" />
      <button id="search-btn" type="button" class="primary">Search</button>
    </div>
    <ul id="track-list"></ul>
  </section>

  <script>
  (() => {{
    let token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('mp_lan_token') || '';
    const pinFromUrl = new URLSearchParams(location.search).get('pin') || '';
    const authBox = document.getElementById('auth-box');
    const playerBox = document.getElementById('player-box');
    const browserBox = document.getElementById('browser-box');
    const pinInput = document.getElementById('pin-input');
    const authErr = document.getElementById('auth-err');
    const folderSelect = document.getElementById('folder-select');
    const searchInput = document.getElementById('search-input');
    const trackList = document.getElementById('track-list');
    const playerEl = document.getElementById('lan-player');
    const fallbackEl = document.getElementById('fallback-player');
    const audioEl = document.getElementById('audio-el');
    const nowPlaying = document.getElementById('now-playing');

    async function unlockWithPin(pin) {{
      const res = await fetch('/api/auth', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ pin }})
      }});
      if (!res.ok) {{ authErr.textContent = 'Invalid PIN'; return false; }}
      const data = await res.json();
      token = data.token;
      sessionStorage.setItem('mp_lan_token', token);
      return true;
    }}

    async function loadLibrary() {{
      const params = new URLSearchParams({{
        folder: folderSelect.value || '',
        q: searchInput.value || '',
        page: '1',
        limit: '100'
      }});
      const res = await fetch('/api/library?' + params, {{
        headers: {{ Authorization: 'Bearer ' + token }}
      }});
      if (res.status === 401) {{
        token = '';
        sessionStorage.removeItem('mp_lan_token');
        authBox.hidden = false; playerBox.hidden = true; browserBox.hidden = true;
        return;
      }}
      const page = await res.json();
      authBox.hidden = true; playerBox.hidden = false; browserBox.hidden = false;
      if (typeof playerEl.addTracks === 'function') fallbackEl.hidden = true;
      if (folderSelect.options.length === 0) {{
        folderSelect.append(new Option('All folders', ''));
        for (const f of page.folders || []) folderSelect.append(new Option(f, f));
      }}
      trackList.innerHTML = '';
      for (const track of page.tracks || []) {{
        const li = document.createElement('li');
        const info = document.createElement('div');
        info.textContent = track.title;
        const sub = document.createElement('div');
        sub.className = 'muted';
        sub.textContent = track.folder + ' · ' + track.format;
        info.append(sub);
        const btn = document.createElement('button');
        btn.className = 'primary';
        btn.textContent = 'Play';
        btn.onclick = async () => {{
          const src = '/api/stream/' + encodeURIComponent(track.id) + '?token=' + encodeURIComponent(token);
          if (typeof playerEl.addTracks === 'function') {{
            await playerEl.clearPlaylist();
            await playerEl.addTracks([{{ src, title: track.title, album: track.folder, format: track.format }}], true);
          }} else {{
            nowPlaying.textContent = track.title;
            audioEl.src = src;
            audioEl.play().catch(() => {{}});
          }}
        }};
        li.append(info, btn);
        trackList.append(li);
      }}
    }}

    document.getElementById('pin-form').onsubmit = async (e) => {{
      e.preventDefault();
      authErr.textContent = '';
      if (await unlockWithPin(pinInput.value.trim())) await loadLibrary();
    }};
    folderSelect.onchange = () => loadLibrary();
    document.getElementById('search-btn').onclick = () => loadLibrary();

    if (token) {{ loadLibrary(); }}
    else if (pinFromUrl) {{ pinInput.value = pinFromUrl; unlockWithPin(pinFromUrl).then(ok => ok && loadLibrary()); }}
  }})();
  </script>
</body>
</html>
"#
    )
}
