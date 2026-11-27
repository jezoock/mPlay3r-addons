use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const SUPPORTED_AUDIO_EXTS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "oga", "opus", "m4a", "aac", "webm",
];

pub const SUPPORTED_PLAYLIST_EXTS: &[&str] = &["m3u", "m3u8", "pls"];

#[derive(Debug, PartialEq, Eq)]
pub enum SecurityError {
    PathTraversal,
    OutsideAllowlist,
    UnsupportedFileType,
    NotFound,
}

#[derive(Debug, Clone)]
pub struct SharedRoot {
    pub id: String,
    pub name: String,
    pub canonical_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct IndexedTrack {
    pub id: String,
    pub root_id: String,
    pub folder: String,
    pub relative_path: String,
    pub title: String,
    pub format: String,
    pub size_bytes: u64,
    pub canonical_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct IndexedPlaylist {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub track_ids: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct LibraryIndex {
    pub folders: Vec<String>,
    pub tracks: Vec<IndexedTrack>,
    pub tracks_by_id: HashMap<String, usize>,
    pub playlists: Vec<IndexedPlaylist>,
}

/// Constant-time byte comparison to prevent timing side-channels on PIN/Bearer token verification.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Decodes `%XX` sequences in a URL path/query component and rejects null bytes.
pub fn percent_decode(input: &str) -> Result<String, SecurityError> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(SecurityError::PathTraversal);
            }
            let hi = hex_nibble(bytes[i + 1]).ok_or(SecurityError::PathTraversal)?;
            let lo = hex_nibble(bytes[i + 2]).ok_or(SecurityError::PathTraversal)?;
            let decoded = (hi << 4) | lo;
            if decoded == 0 {
                return Err(SecurityError::PathTraversal);
            }
            out.push(decoded);
            i += 3;
        } else if bytes[i] == 0 {
            return Err(SecurityError::PathTraversal);
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| SecurityError::PathTraversal)
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Checks whether a raw or decoded path contains traversal segments, backslashes, or null bytes.
pub fn has_traversal_segments(raw_path: &str) -> bool {
    if raw_path.contains('\0') || raw_path.contains('\\') {
        return true;
    }
    let lower = raw_path.to_ascii_lowercase();
    if lower.contains("%2e") || lower.contains("%5c") || lower.contains("%00") {
        return true;
    }
    for segment in raw_path.split('/') {
        if segment == ".." {
            return true;
        }
    }
    false
}

pub fn is_supported_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            SUPPORTED_AUDIO_EXTS.contains(&lower.as_str())
        })
        .unwrap_or(false)
}

pub fn is_supported_playlist(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            SUPPORTED_PLAYLIST_EXTS.contains(&lower.as_str())
        })
        .unwrap_or(false)
}

/// Deterministic 64-bit FNV-1a hex digest used for opaque track/root identifiers.
pub fn fnv1a_hex(input: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Strict allowlist of user-selected shared music folders.
#[derive(Debug, Clone)]
pub struct AllowedLibrary {
    roots: Vec<SharedRoot>,
}

impl AllowedLibrary {
    pub fn from_dirs(dirs: &[PathBuf]) -> Self {
        let mut roots = Vec::new();
        let mut seen = Vec::new();
        for dir in dirs {
            if let Ok(canonical) = fs::canonicalize(dir) {
                if canonical.is_dir() && !seen.contains(&canonical) {
                    let name = canonical
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "Library".to_string());
                    let id = fnv1a_hex(&canonical.to_string_lossy());
                    seen.push(canonical.clone());
                    roots.push(SharedRoot {
                        id,
                        name,
                        canonical_path: canonical,
                    });
                }
            }
        }
        Self { roots }
    }

    pub fn roots(&self) -> &[SharedRoot] {
        &self.roots
    }

    /// Resolves a `(root_id, relative_path)` pair strictly inside the canonical allowlisted folder.
    /// Rejects path traversal (`../`, `%2e%2e`), symlink escapes outside the root, and non-audio files.
    pub fn resolve_safe_audio_file(
        &self,
        root_id: &str,
        raw_relative: &str,
    ) -> Result<PathBuf, SecurityError> {
        let decoded = percent_decode(raw_relative)?;
        if has_traversal_segments(raw_relative) || has_traversal_segments(&decoded) {
            return Err(SecurityError::PathTraversal);
        }

        let root = self
            .roots
            .iter()
            .find(|r| r.id == root_id)
            .ok_or(SecurityError::OutsideAllowlist)?;

        let rel_path = Path::new(decoded.trim_start_matches('/'));
        for comp in rel_path.components() {
            match comp {
                Component::Normal(_) | Component::CurDir => {}
                Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                    return Err(SecurityError::PathTraversal);
                }
            }
        }

        let candidate = root.canonical_path.join(rel_path);
        let canonical = fs::canonicalize(&candidate).map_err(|_| SecurityError::NotFound)?;
        if !canonical.starts_with(&root.canonical_path) {
            return Err(SecurityError::OutsideAllowlist);
        }
        if !canonical.is_file() {
            return Err(SecurityError::NotFound);
        }
        if !is_supported_audio(&canonical) {
            return Err(SecurityError::UnsupportedFileType);
        }
        Ok(canonical)
    }

    /// Verifies that an already-known canonical path still resides inside an allowlisted root.
    pub fn is_authorized_audio(&self, candidate: &Path) -> bool {
        let Ok(canonical) = fs::canonicalize(candidate) else {
            return false;
        };
        if !canonical.is_file() || !is_supported_audio(&canonical) {
            return false;
        }
        self.roots
            .iter()
            .any(|root| canonical.starts_with(&root.canonical_path))
    }

    /// Recursively indexes audio files and M3U/PLS playlists strictly contained in allowlisted roots.
    pub fn scan(&self) -> LibraryIndex {
        let mut index = LibraryIndex::default();
        let mut folder_set = Vec::new();
        let mut raw_playlists: Vec<(String, String, PathBuf, PathBuf)> = Vec::new();
        let mut path_to_track_id: HashMap<PathBuf, String> = HashMap::new();

        for root in &self.roots {
            let root_label = root.name.clone();
            if !folder_set.contains(&root_label) {
                folder_set.push(root_label.clone());
            }
            scan_dir_recursive(
                root,
                &root.canonical_path,
                &mut folder_set,
                &mut index.tracks,
                &mut raw_playlists,
            );
        }

        folder_set.sort();
        index
            .tracks
            .sort_by(|a, b| a.folder.cmp(&b.folder).then_with(|| a.title.cmp(&b.title)));

        for (i, track) in index.tracks.iter().enumerate() {
            index.tracks_by_id.insert(track.id.clone(), i);
            path_to_track_id.insert(track.canonical_path.clone(), track.id.clone());
        }

        for (name, folder, pl_path, root_canonical) in raw_playlists {
            if let Ok(content) = fs::read_to_string(&pl_path) {
                let base_dir = pl_path.parent().unwrap_or(&root_canonical);
                let mut track_ids = Vec::new();
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        continue;
                    }
                    let entry = if let Some(rest) = trimmed.strip_prefix("File") {
                        rest.split_once('=').map(|(_, v)| v.trim()).unwrap_or("")
                    } else {
                        trimmed
                    };
                    if entry.is_empty() || has_traversal_segments(entry) {
                        continue;
                    }
                    if let Ok(canonical) = fs::canonicalize(base_dir.join(entry)) {
                        if canonical.starts_with(&root_canonical) {
                            if let Some(tid) = path_to_track_id.get(&canonical) {
                                track_ids.push(tid.clone());
                            }
                        }
                    }
                }
                if !track_ids.is_empty() {
                    index.playlists.push(IndexedPlaylist {
                        id: fnv1a_hex(&pl_path.to_string_lossy()),
                        name,
                        folder,
                        track_ids,
                    });
                }
            }
        }

        index.folders = folder_set;
        index
    }
}

fn scan_dir_recursive(
    root: &SharedRoot,
    dir: &Path,
    folders: &mut Vec<String>,
    tracks: &mut Vec<IndexedTrack>,
    playlists: &mut Vec<(String, String, PathBuf, PathBuf)>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(canonical) = fs::canonicalize(&path) else {
            continue;
        };
        // Security boundary: ignore any symlink escaping outside the allowlisted root.
        if !canonical.starts_with(&root.canonical_path) {
            continue;
        }
        if canonical.is_dir() {
            if let Ok(rel_dir) = canonical.strip_prefix(&root.canonical_path) {
                let folder_label = format_folder_label(&root.name, rel_dir);
                if !folders.contains(&folder_label) {
                    folders.push(folder_label);
                }
            }
            scan_dir_recursive(root, &canonical, folders, tracks, playlists);
        } else if canonical.is_file() {
            let Ok(rel_file) = canonical.strip_prefix(&root.canonical_path) else {
                continue;
            };
            let rel_str = rel_file.to_string_lossy().replace('\\', "/");
            let folder_label = rel_file
                .parent()
                .map(|p| format_folder_label(&root.name, p))
                .unwrap_or_else(|| root.name.clone());

            if is_supported_audio(&canonical) {
                let size_bytes = fs::metadata(&canonical).map(|m| m.len()).unwrap_or(0);
                let title = canonical
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Untitled".to_string());
                let format = canonical
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_ascii_uppercase())
                    .unwrap_or_else(|| "AUDIO".to_string());
                let id = fnv1a_hex(&format!("{}:{}", root.id, rel_str));
                tracks.push(IndexedTrack {
                    id,
                    root_id: root.id.clone(),
                    folder: folder_label,
                    relative_path: rel_str,
                    title,
                    format,
                    size_bytes,
                    canonical_path: canonical,
                });
            } else if is_supported_playlist(&canonical) {
                let name = canonical
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Playlist".to_string());
                playlists.push((name, folder_label, canonical, root.canonical_path.clone()));
            }
        }
    }
}

fn format_folder_label(root_name: &str, rel: &Path) -> String {
    let rel_str = rel.to_string_lossy().replace('\\', "/");
    let trimmed = rel_str.trim_matches('/');
    if trimmed.is_empty() {
        root_name.to_string()
    } else {
        format!("{root_name}/{trimmed}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_constant_time_eq_and_path_traversal_guards() {
        assert!(constant_time_eq(b"482910", b"482910"));
        assert!(!constant_time_eq(b"482910", b"482911"));
        assert!(!constant_time_eq(b"482910", b"48291"));

        assert!(has_traversal_segments("../secret.mp3"));
        assert!(has_traversal_segments("a/%2e%2e/secret.mp3"));
        assert!(has_traversal_segments("a\\b.mp3"));
        assert!(has_traversal_segments("song.mp3%00.txt"));
        assert!(!has_traversal_segments("Album 2026/01 - Track.flac"));

        assert_eq!(percent_decode("My%20Track.mp3"), Ok("My Track.mp3".to_string()));
        assert_eq!(percent_decode("bad%00null"), Err(SecurityError::PathTraversal));
    }
}
