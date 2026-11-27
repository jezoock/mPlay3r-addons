use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RangeError {
    InvalidSyntax,
    NotSatisfiable,
}

/// Parses an HTTP `Range: bytes=...` header against `file_size` per RFC 9110.
pub fn parse_http_range(header: &str, file_size: u64) -> Result<ByteRange, RangeError> {
    if file_size == 0 {
        return Err(RangeError::NotSatisfiable);
    }
    let trimmed = header.trim();
    let spec = trimmed
        .strip_prefix("bytes=")
        .ok_or(RangeError::InvalidSyntax)?;

    // Reject multi-range requests (keep lightweight single-range streaming).
    if spec.contains(',') {
        return Err(RangeError::InvalidSyntax);
    }

    let (start_str, end_str) = spec.split_once('-').ok_or(RangeError::InvalidSyntax)?;
    let start_str = start_str.trim();
    let end_str = end_str.trim();

    if start_str.is_empty() && end_str.is_empty() {
        return Err(RangeError::InvalidSyntax);
    }

    if start_str.is_empty() {
        // Suffix range: `bytes=-N`
        let suffix: u64 = end_str.parse().map_err(|_| RangeError::InvalidSyntax)?;
        if suffix == 0 {
            return Err(RangeError::NotSatisfiable);
        }
        let start = file_size.saturating_sub(suffix);
        return Ok(ByteRange {
            start,
            end: file_size - 1,
        });
    }

    let start: u64 = start_str.parse().map_err(|_| RangeError::InvalidSyntax)?;
    if start >= file_size {
        return Err(RangeError::NotSatisfiable);
    }

    let end = if end_str.is_empty() {
        file_size - 1
    } else {
        let parsed_end: u64 = end_str.parse().map_err(|_| RangeError::InvalidSyntax)?;
        if parsed_end < start {
            return Err(RangeError::NotSatisfiable);
        }
        parsed_end.min(file_size - 1)
    };

    Ok(ByteRange { start, end })
}

pub fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("opus") => "audio/opus",
        Some("m4a") | Some("aac") => "audio/mp4",
        Some("webm") => "audio/webm",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_closed_open_suffix_and_rejects_invalid_ranges() {
        assert_eq!(
            parse_http_range("bytes=0-9", 100),
            Ok(ByteRange { start: 0, end: 9 })
        );
        assert_eq!(
            parse_http_range("bytes=50-", 100),
            Ok(ByteRange { start: 50, end: 99 })
        );
        assert_eq!(
            parse_http_range("bytes=-12", 100),
            Ok(ByteRange { start: 88, end: 99 })
        );
        // End beyond file size clamps to file_size - 1 per RFC 9110
        assert_eq!(
            parse_http_range("bytes=90-500", 100),
            Ok(ByteRange { start: 90, end: 99 })
        );
        assert_eq!(
            parse_http_range("bytes=100-120", 100),
            Err(RangeError::NotSatisfiable)
        );
        assert_eq!(
            parse_http_range("bytes=20-10", 100),
            Err(RangeError::NotSatisfiable)
        );
        assert_eq!(
            parse_http_range("bytes=0-1,2-3", 100),
            Err(RangeError::InvalidSyntax)
        );
        assert_eq!(
            parse_http_range("bytes=0-1", 0),
            Err(RangeError::NotSatisfiable)
        );
    }
}
