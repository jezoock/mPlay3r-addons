use crate::range::{mime_type_for_path, parse_http_range, RangeError};
use crate::security::{
    constant_time_eq, has_traversal_segments, percent_decode, AllowedLibrary, LibraryIndex,
    SecurityError,
};
use crate::web_ui::render_embedded_web_client;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

const MAX_REQUEST_BYTES: usize = 16 * 1024;
const STREAM_CHUNK_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub bind_addr: String,
    pub server_name: String,
    pub pin: String,
    pub bearer_token: String,
    pub shared_dirs: Vec<PathBuf>,
}

struct SharedState {
    server_name: String,
    pin: String,
    bearer_token: String,
    library: AllowedLibrary,
    index: LibraryIndex,
}

pub struct LanServerHandle {
    local_addr: SocketAddr,
    shutdown_flag: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl LanServerHandle {
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub fn shutdown(&mut self) {
        self.shutdown_flag.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(self.local_addr);
        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for LanServerHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Starts the LAN HTTP/1.1 micro-server on `config.bind_addr`.
pub fn start_lan_server(config: ServerConfig) -> std::io::Result<LanServerHandle> {
    let listener = TcpListener::bind(&config.bind_addr)?;
    let local_addr = listener.local_addr()?;

    let library = AllowedLibrary::from_dirs(&config.shared_dirs);
    let index = library.scan();
    let state = Arc::new(SharedState {
        server_name: config.server_name,
        pin: config.pin,
        bearer_token: config.bearer_token,
        library,
        index,
    });
    let shutdown_flag = Arc::new(AtomicBool::new(false));
    let loop_flag = Arc::clone(&shutdown_flag);

    let worker = thread::spawn(move || {
        for incoming in listener.incoming() {
            if loop_flag.load(Ordering::SeqCst) {
                break;
            }
            let Ok(stream) = incoming else {
                continue;
            };
            let req_state = Arc::clone(&state);
            thread::spawn(move || {
                let _ = handle_connection(stream, &req_state);
            });
        }
    });

    Ok(LanServerHandle {
        local_addr,
        shutdown_flag,
        worker: Some(worker),
    })
}

struct ParsedRequest {
    method: String,
    raw_target: String,
    path: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
    body: String,
}

fn read_http_request(stream: &mut TcpStream) -> Option<ParsedRequest> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let mut buf = Vec::with_capacity(2048);
    let mut temp = [0u8; 1024];
    let header_end;

    loop {
        let n = stream.read(&mut temp).ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&temp[..n]);
        if let Some(pos) = find_subslice(&buf, b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if buf.len() >= MAX_REQUEST_BYTES {
            return None;
        }
    }

    let head_str = std::str::from_utf8(&buf[..header_end - 4]).ok()?;
    let mut lines = head_str.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_ascii_uppercase();
    let raw_target = parts.next()?.to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let content_length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
        .min(MAX_REQUEST_BYTES);

    while buf.len() < header_end + content_length {
        let n = stream.read(&mut temp).ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&temp[..n]);
        if buf.len() > MAX_REQUEST_BYTES + header_end {
            break;
        }
    }

    let body_end = (header_end + content_length).min(buf.len());
    let body = String::from_utf8_lossy(&buf[header_end..body_end]).to_string();

    let (path_raw, query_raw) = raw_target
        .split_once('?')
        .map(|(p, q)| (p.to_string(), Some(q)))
        .unwrap_or_else(|| (raw_target.clone(), None));

    let mut query = HashMap::new();
    if let Some(qs) = query_raw {
        for pair in qs.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            let k_dec = percent_decode(&k.replace('+', " ")).unwrap_or_default();
            let v_dec = percent_decode(&v.replace('+', " ")).unwrap_or_default();
            if !k_dec.is_empty() {
                query.insert(k_dec, v_dec);
            }
        }
    }

    Some(ParsedRequest {
        method,
        raw_target,
        path: path_raw,
        query,
        headers,
        body,
    })
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn is_authenticated(req: &ParsedRequest, expected_token: &str) -> bool {
    if expected_token.is_empty() {
        return false;
    }
    if let Some(auth) = req.headers.get("authorization") {
        if let Some(token) = auth.strip_prefix("Bearer ").or_else(|| auth.strip_prefix("bearer ")) {
            return constant_time_eq(token.trim().as_bytes(), expected_token.as_bytes());
        }
    }
    if let Some(token) = req.query.get("token") {
        return constant_time_eq(token.trim().as_bytes(), expected_token.as_bytes());
    }
    false
}

fn handle_connection(mut stream: TcpStream, state: &SharedState) -> std::io::Result<()> {
    let Some(req) = read_http_request(&mut stream) else {
        return Ok(());
    };

    if req.method == "OPTIONS" {
        return write_response(&mut stream, "204 No Content", "text/plain", &[], &[]);
    }

    // Reject path traversal globally before routing any endpoint.
    if has_traversal_segments(&req.raw_target) || has_traversal_segments(&req.path) {
        return write_json(
            &mut stream,
            "403 Forbidden",
            r#"{"error":"Path traversal is forbidden"}"#,
        );
    }

    if req.method == "GET" && (req.path == "/" || req.path == "/index.html") {
        let html = render_embedded_web_client(&state.server_name);
        return write_response(
            &mut stream,
            "200 OK",
            "text/html; charset=utf-8",
            html.as_bytes(),
            &[],
        );
    }

    if req.method == "GET" && req.path == "/api/info" {
        let json = format!(
            r#"{{"name":"{}","version":"{}","authRequired":true,"folderCount":{},"trackCount":{}}}"#,
            json_escape(&state.server_name),
            env!("CARGO_PKG_VERSION"),
            state.index.folders.len(),
            state.index.tracks.len()
        );
        return write_json(&mut stream, "200 OK", &json);
    }

    if req.method == "POST" && req.path == "/api/auth" {
        let submitted_pin = extract_json_string_field(&req.body, "pin").unwrap_or_default();
        if !submitted_pin.is_empty()
            && constant_time_eq(submitted_pin.as_bytes(), state.pin.as_bytes())
        {
            let json = format!(
                r#"{{"token":"{}","name":"{}"}}"#,
                json_escape(&state.bearer_token),
                json_escape(&state.server_name)
            );
            return write_json(&mut stream, "200 OK", &json);
        }
        return write_json(&mut stream, "401 Unauthorized", r#"{"error":"Invalid PIN"}"#);
    }

    // All endpoints below require a valid Bearer token.
    if !is_authenticated(&req, &state.bearer_token) {
        return write_response(
            &mut stream,
            "401 Unauthorized",
            "application/json; charset=utf-8",
            br#"{"error":"Unauthorized: valid Bearer token required"}"#,
            &[("WWW-Authenticate", "Bearer realm=\"mPlay3r LAN\"")],
        );
    }

    if req.method == "GET" && req.path == "/api/library" {
        return handle_library_query(&mut stream, &req, state);
    }

    if req.method == "GET" && req.path == "/api/playlists" {
        return handle_playlists(&mut stream, state);
    }

    if req.method == "GET" {
        if let Some(track_id) = req.path.strip_prefix("/api/stream/") {
            let clean_id = track_id.trim();
            let Some(&idx) = state.index.tracks_by_id.get(clean_id) else {
                return write_json(&mut stream, "404 Not Found", r#"{"error":"Track not found"}"#);
            };
            let track = &state.index.tracks[idx];
            if !state.library.is_authorized_audio(&track.canonical_path) {
                return write_json(
                    &mut stream,
                    "403 Forbidden",
                    r#"{"error":"File outside shared folder allowlist"}"#,
                );
            }
            return stream_audio_file(&mut stream, &req, &track.canonical_path);
        }

        if let Some(rest) = req.path.strip_prefix("/api/file/") {
            let Some((root_id, rel_path)) = rest.split_once('/') else {
                return write_json(&mut stream, "400 Bad Request", r#"{"error":"Invalid file path"}"#);
            };
            return match state.library.resolve_safe_audio_file(root_id, rel_path) {
                Ok(canonical) => stream_audio_file(&mut stream, &req, &canonical),
                Err(SecurityError::PathTraversal) | Err(SecurityError::OutsideAllowlist) => {
                    write_json(&mut stream, "403 Forbidden", r#"{"error":"Access denied"}"#)
                }
                Err(SecurityError::UnsupportedFileType) => write_json(
                    &mut stream,
                    "403 Forbidden",
                    r#"{"error":"Unsupported file type"}"#,
                ),
                Err(SecurityError::NotFound) => {
                    write_json(&mut stream, "404 Not Found", r#"{"error":"File not found"}"#)
                }
            };
        }
    }

    write_json(&mut stream, "404 Not Found", r#"{"error":"Endpoint not found"}"#)
}

fn handle_library_query(
    stream: &mut TcpStream,
    req: &ParsedRequest,
    state: &SharedState,
) -> std::io::Result<()> {
    let folder_filter = req.query.get("folder").map(|s| s.trim()).unwrap_or("");
    let query_filter = req
        .query
        .get("q")
        .map(|s| s.trim().to_ascii_lowercase())
        .unwrap_or_default();
    let page: usize = req
        .query
        .get("page")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1)
        .max(1);
    let limit: usize = req
        .query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(50)
        .clamp(1, 200);

    let filtered: Vec<_> = state
        .index
        .tracks
        .iter()
        .filter(|t| {
            if !folder_filter.is_empty()
                && t.folder != folder_filter
                && !t.folder.starts_with(&format!("{folder_filter}/"))
            {
                return false;
            }
            if !query_filter.is_empty() {
                let hay_title = t.title.to_ascii_lowercase();
                let hay_folder = t.folder.to_ascii_lowercase();
                if !hay_title.contains(&query_filter) && !hay_folder.contains(&query_filter) {
                    return false;
                }
            }
            true
        })
        .collect();

    let total = filtered.len();
    let total_pages = total.div_ceil(limit).max(1);
    let offset = (page - 1).saturating_mul(limit);
    let page_tracks = if offset < total {
        &filtered[offset..(offset + limit).min(total)]
    } else {
        &[]
    };

    let folders_json: Vec<String> = state
        .index
        .folders
        .iter()
        .map(|f| format!(r#""{}""#, json_escape(f)))
        .collect();
    let tracks_json: Vec<String> = page_tracks
        .iter()
        .map(|t| {
            format!(
                r#"{{"id":"{}","title":"{}","folder":"{}","format":"{}","sizeBytes":{}}}"#,
                json_escape(&t.id),
                json_escape(&t.title),
                json_escape(&t.folder),
                json_escape(&t.format),
                t.size_bytes
            )
        })
        .collect();

    let body = format!(
        r#"{{"serverName":"{}","folder":"{}","query":"{}","page":{},"limit":{},"total":{},"totalPages":{},"folders":[{}],"tracks":[{}]}}"#,
        json_escape(&state.server_name),
        json_escape(folder_filter),
        json_escape(&query_filter),
        page,
        limit,
        total,
        total_pages,
        folders_json.join(","),
        tracks_json.join(",")
    );

    write_json(stream, "200 OK", &body)
}

fn handle_playlists(stream: &mut TcpStream, state: &SharedState) -> std::io::Result<()> {
    let items: Vec<String> = state
        .index
        .playlists
        .iter()
        .map(|pl| {
            let tracks_json: Vec<String> = pl
                .track_ids
                .iter()
                .filter_map(|id| state.index.tracks_by_id.get(id).map(|&i| &state.index.tracks[i]))
                .map(|t| {
                    format!(
                        r#"{{"id":"{}","title":"{}","folder":"{}","format":"{}","sizeBytes":{}}}"#,
                        json_escape(&t.id),
                        json_escape(&t.title),
                        json_escape(&t.folder),
                        json_escape(&t.format),
                        t.size_bytes
                    )
                })
                .collect();
            format!(
                r#"{{"id":"{}","name":"{}","folder":"{}","trackCount":{},"tracks":[{}]}}"#,
                json_escape(&pl.id),
                json_escape(&pl.name),
                json_escape(&pl.folder),
                tracks_json.len(),
                tracks_json.join(",")
            )
        })
        .collect();

    let body = format!(r#"{{"playlists":[{}]}}"#, items.join(","));
    write_json(stream, "200 OK", &body)
}

fn stream_audio_file(
    stream: &mut TcpStream,
    req: &ParsedRequest,
    path: &std::path::Path,
) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    let file_size = file.metadata()?.len();
    let mime = mime_type_for_path(path);

    if let Some(range_header) = req.headers.get("range") {
        match parse_http_range(range_header, file_size) {
            Ok(range) => {
                let len = range.end - range.start + 1;
                file.seek(SeekFrom::Start(range.start))?;
                let content_range = format!("bytes {}-{}/{}", range.start, range.end, file_size);
                write_headers(
                    stream,
                    "206 Partial Content",
                    mime,
                    len,
                    &[
                        ("Accept-Ranges", "bytes"),
                        ("Content-Range", &content_range),
                    ],
                )?;
                return copy_exact_chunks(&mut file, stream, len);
            }
            Err(RangeError::NotSatisfiable) | Err(RangeError::InvalidSyntax) => {
                let content_range = format!("bytes */{file_size}");
                return write_response(
                    stream,
                    "416 Range Not Satisfiable",
                    "application/json; charset=utf-8",
                    br#"{"error":"Range not satisfiable"}"#,
                    &[("Content-Range", &content_range)],
                );
            }
        }
    }

    write_headers(stream, "200 OK", mime, file_size, &[("Accept-Ranges", "bytes")])?;
    copy_exact_chunks(&mut file, stream, file_size)
}

fn copy_exact_chunks(
    file: &mut File,
    stream: &mut TcpStream,
    mut remaining: u64,
) -> std::io::Result<()> {
    let mut chunk = vec![0u8; STREAM_CHUNK_BYTES];
    while remaining > 0 {
        let to_read = (remaining as usize).min(chunk.len());
        let n = file.read(&mut chunk[..to_read])?;
        if n == 0 {
            break;
        }
        stream.write_all(&chunk[..n])?;
        remaining -= n as u64;
    }
    stream.flush()
}

fn write_json(stream: &mut TcpStream, status: &str, json: &str) -> std::io::Result<()> {
    write_response(
        stream,
        status,
        "application/json; charset=utf-8",
        json.as_bytes(),
        &[("Cache-Control", "no-store")],
    )
}

fn write_headers(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    content_length: u64,
    extra: &[(&str, &str)],
) -> std::io::Result<()> {
    let mut head = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {content_length}\r\n\
         Connection: close\r\n\
         X-Content-Type-Options: nosniff\r\n\
         X-Frame-Options: DENY\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: Authorization, Content-Type, Range\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
    );
    for (k, v) in extra {
        head.push_str(k);
        head.push_str(": ");
        head.push_str(v);
        head.push_str("\r\n");
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    extra: &[(&str, &str)],
) -> std::io::Result<()> {
    write_headers(stream, status, content_type, body.len() as u64, extra)?;
    stream.write_all(body)?;
    stream.flush()
}

pub fn json_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn extract_json_string_field(body: &str, key: &str) -> Option<String> {
    let needle = format!(r#""{key}""#);
    let idx = body.find(&needle)?;
    let after_key = &body[idx + needle.len()..];
    let colon = after_key.find(':')?;
    let rest = after_key[colon + 1..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let mut out = String::new();
    let mut chars = rest[1..].chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                if let Some(escaped) = chars.next() {
                    out.push(escaped);
                }
            }
            '"' => return Some(out),
            other => out.push(other),
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("mplay3r_lan_{label}_{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn raw_http(addr: SocketAddr, request: &str) -> (u16, HashMap<String, String>, Vec<u8>) {
        let mut stream = TcpStream::connect(addr).unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        stream.flush().unwrap();
        let mut data = Vec::new();
        stream.read_to_end(&mut data).unwrap();
        let split = find_subslice(&data, b"\r\n\r\n").expect("valid HTTP response");
        let head = String::from_utf8_lossy(&data[..split]);
        let mut lines = head.split("\r\n");
        let status_line = lines.next().unwrap();
        let status: u16 = status_line.split_whitespace().nth(1).unwrap().parse().unwrap();
        let mut headers = HashMap::new();
        for line in lines {
            if let Some((k, v)) = line.split_once(':') {
                headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
            }
        }
        (status, headers, data[split + 4..].to_vec())
    }

    #[test]
    fn enforces_401_auth_and_exchanges_pin_for_bearer_token() {
        let dir = make_temp_dir("auth");
        fs::write(dir.join("song.mp3"), b"ID3-AUDIO-DATA-0123456789").unwrap();

        let mut server = start_lan_server(ServerConfig {
            bind_addr: "127.0.0.1:0".to_string(),
            server_name: "Test Studio".to_string(),
            pin: "482910".to_string(),
            bearer_token: "secret-bearer-token-xyz".to_string(),
            shared_dirs: vec![dir.clone()],
        })
        .unwrap();
        let addr = server.local_addr();

        // Missing token -> 401
        let (status, _, _) = raw_http(addr, "GET /api/library HTTP/1.1\r\nHost: localhost\r\n\r\n");
        assert_eq!(status, 401);

        // Wrong token -> 401
        let (status, _, _) = raw_http(
            addr,
            "GET /api/playlists HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer wrong\r\n\r\n",
        );
        assert_eq!(status, 401);

        // Wrong PIN -> 401
        let bad_body = r#"{"pin":"000000"}"#;
        let (status, _, _) = raw_http(
            addr,
            &format!(
                "POST /api/auth HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\n\r\n{}",
                bad_body.len(),
                bad_body
            ),
        );
        assert_eq!(status, 401);

        // Correct PIN -> 200 + token
        let ok_body = r#"{"pin":"482910"}"#;
        let (status, _, body) = raw_http(
            addr,
            &format!(
                "POST /api/auth HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\n\r\n{}",
                ok_body.len(),
                ok_body
            ),
        );
        assert_eq!(status, 200);
        let token = extract_json_string_field(&String::from_utf8_lossy(&body), "token").unwrap();
        assert_eq!(token, "secret-bearer-token-xyz");

        // Authenticated library request -> 200
        let (status, _, body) = raw_http(
            addr,
            &format!(
                "GET /api/library HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\n\r\n"
            ),
        );
        assert_eq!(status, 200);
        assert!(String::from_utf8_lossy(&body).contains(r#""title":"song""#));

        server.shutdown();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn enforces_allowlist_and_blocks_path_traversal_and_symlink_escapes() {
        let base = make_temp_dir("sec");
        let shared = base.join("shared_music");
        let outside = base.join("private_secrets");
        fs::create_dir_all(&shared).unwrap();
        fs::create_dir_all(&outside).unwrap();

        fs::write(shared.join("allowed.mp3"), b"ALLOWED-MP3-BYTES").unwrap();
        fs::write(shared.join(".env"), b"API_SECRET=should_never_leak").unwrap();
        fs::write(outside.join("secret.mp3"), b"OUTSIDE-PRIVATE-MP3").unwrap();

        // Create a symlink inside the shared folder pointing to the outside file (Unix).
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink(
                outside.join("secret.mp3"),
                shared.join("escape_link.mp3"),
            );
        }

        let lib = AllowedLibrary::from_dirs(&[shared.clone()]);
        let root_id = lib.roots()[0].id.clone();

        // Non-audio file inside shared folder is rejected.
        assert_eq!(
            lib.resolve_safe_audio_file(&root_id, ".env"),
            Err(SecurityError::UnsupportedFileType)
        );
        // Traversal variants are rejected.
        assert_eq!(
            lib.resolve_safe_audio_file(&root_id, "../private_secrets/secret.mp3"),
            Err(SecurityError::PathTraversal)
        );
        assert_eq!(
            lib.resolve_safe_audio_file(&root_id, "%2e%2e/private_secrets/secret.mp3"),
            Err(SecurityError::PathTraversal)
        );
        #[cfg(unix)]
        {
            assert_eq!(
                lib.resolve_safe_audio_file(&root_id, "escape_link.mp3"),
                Err(SecurityError::OutsideAllowlist)
            );
        }

        let mut server = start_lan_server(ServerConfig {
            bind_addr: "127.0.0.1:0".to_string(),
            server_name: "SecTest".to_string(),
            pin: "123456".to_string(),
            bearer_token: "tok".to_string(),
            shared_dirs: vec![shared.clone()],
        })
        .unwrap();
        let addr = server.local_addr();

        // Library scan must ONLY expose `allowed.mp3` (never `.env` or `escape_link.mp3`).
        let (status, _, body) = raw_http(
            addr,
            "GET /api/library HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer tok\r\n\r\n",
        );
        assert_eq!(status, 200);
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains(r#""title":"allowed""#));
        assert!(!text.contains(".env"));
        assert!(!text.contains("escape_link"));
        assert!(!text.contains("secret"));

        // HTTP path traversal attempts return 403 Forbidden.
        for attack in [
            format!("/api/file/{root_id}/../private_secrets/secret.mp3"),
            format!("/api/file/{root_id}/%2e%2e%2fprivate_secrets/secret.mp3"),
            format!("/api/file/{root_id}/.env"),
        ] {
            let (code, _, resp_body) = raw_http(
                addr,
                &format!(
                    "GET {attack} HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer tok\r\n\r\n"
                ),
            );
            assert_eq!(code, 403, "Expected 403 for attack path {attack}");
            assert!(!String::from_utf8_lossy(&resp_body).contains("SECRET"));
            assert!(!String::from_utf8_lossy(&resp_body).contains("OUTSIDE"));
        }

        server.shutdown();
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn streams_http_206_ranges_playlists_pagination_and_embedded_web_ui() {
        let dir = make_temp_dir("stream");
        let sub = dir.join("Electro");
        fs::create_dir_all(&sub).unwrap();

        let audio_bytes: Vec<u8> = (0u8..100u8).collect();
        fs::write(sub.join("track_a.flac"), &audio_bytes).unwrap();
        fs::write(sub.join("track_b.mp3"), b"SECOND-TRACK").unwrap();
        fs::write(sub.join("mix.m3u8"), "#EXTM3U\ntrack_a.flac\ntrack_b.mp3\n").unwrap();

        let mut server = start_lan_server(ServerConfig {
            bind_addr: "127.0.0.1:0".to_string(),
            server_name: "Home <HiFi>".to_string(),
            pin: "654321".to_string(),
            bearer_token: "stream-tok".to_string(),
            shared_dirs: vec![dir.clone()],
        })
        .unwrap();
        let addr = server.local_addr();

        // Embedded <mplay3r-app> web UI served at GET / with security headers & HTML escaping.
        let (status, headers, html) = raw_http(addr, "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
        assert_eq!(status, 200);
        assert_eq!(headers.get("x-content-type-options").map(String::as_str), Some("nosniff"));
        assert_eq!(headers.get("x-frame-options").map(String::as_str), Some("DENY"));
        let html_str = String::from_utf8_lossy(&html);
        assert!(html_str.contains("<mplay3r-app"));
        assert!(html_str.contains("Home &lt;HiFi&gt;"));

        // Paginated search for track_a
        let (status, _, body) = raw_http(
            addr,
            "GET /api/library?q=track_a&page=1&limit=1 HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer stream-tok\r\n\r\n",
        );
        assert_eq!(status, 200);
        let body_str = String::from_utf8_lossy(&body);
        assert!(body_str.contains(r#""total":1"#));
        let track_id = extract_json_string_field(&body_str, "id").unwrap();

        // Playlists endpoint returns mix.m3u8 with 2 tracks
        let (status, _, pl_body) = raw_http(
            addr,
            "GET /api/playlists HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer stream-tok\r\n\r\n",
        );
        assert_eq!(status, 200);
        let pl_str = String::from_utf8_lossy(&pl_body);
        assert!(pl_str.contains(r#""name":"mix""#));
        assert!(pl_str.contains(r#""trackCount":2"#));

        // Closed Range: bytes=10-25 -> 206 Partial Content
        let (status, headers, chunk) = raw_http(
            addr,
            &format!(
                "GET /api/stream/{track_id}?token=stream-tok HTTP/1.1\r\nHost: localhost\r\nRange: bytes=10-25\r\n\r\n"
            ),
        );
        assert_eq!(status, 206);
        assert_eq!(headers.get("content-type").map(String::as_str), Some("audio/flac"));
        assert_eq!(headers.get("content-range").map(String::as_str), Some("bytes 10-25/100"));
        assert_eq!(chunk, &audio_bytes[10..=25]);

        // Suffix Range: bytes=-8 -> last 8 bytes
        let (status, headers, chunk) = raw_http(
            addr,
            &format!(
                "GET /api/stream/{track_id} HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer stream-tok\r\nRange: bytes=-8\r\n\r\n"
            ),
        );
        assert_eq!(status, 206);
        assert_eq!(headers.get("content-range").map(String::as_str), Some("bytes 92-99/100"));
        assert_eq!(chunk, &audio_bytes[92..]);

        // Invalid Range -> 416 Range Not Satisfiable
        let (status, _, _) = raw_http(
            addr,
            &format!(
                "GET /api/stream/{track_id} HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer stream-tok\r\nRange: bytes=500-600\r\n\r\n"
            ),
        );
        assert_eq!(status, 416);

        server.shutdown();
        let _ = fs::remove_dir_all(&dir);
    }
}
