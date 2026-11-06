//! Size of the cache folder and emptying it.
//!
//! Everything in the cache can be rebuilt (see `media.rs`): audio extracted by FFmpeg,
//! video proxies. Files in use (the video on screen) are skipped, never forced.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// One kind of file in the cache, named after its subfolder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum CacheKind {
    /// Audio FFmpeg extracted from files symphonia cannot read
    Audio,
    /// H.264 copies of videos WebView2 cannot play
    Video,
}

impl CacheKind {
    pub const ALL: [Self; 2] = [Self::Audio, Self::Video];

    /// Subfolder of the cache, as used by `media::cache_file`.
    pub fn folder(self) -> &'static str {
        match self {
            Self::Audio => "audio",
            Self::Video => "video",
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CacheUsage {
    pub kind: CacheKind,
    /// Bytes on disk (a number, not a bigint: never close to 2^53)
    pub bytes: f64,
    pub files: u32,
}

/// Files directly inside `dir` (the cache has no deeper folders).
fn files(dir: &Path) -> Vec<(PathBuf, u64)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            meta.is_file().then(|| (entry.path(), meta.len()))
        })
        .collect()
}

/// How much each kind of cache file takes.
pub fn usage(cache_dir: &Path) -> Vec<CacheUsage> {
    CacheKind::ALL
        .into_iter()
        .map(|kind| {
            let found = files(&cache_dir.join(kind.folder()));
            CacheUsage {
                kind,
                bytes: found.iter().map(|(_, size)| *size as f64).sum(),
                files: found.len() as u32,
            }
        })
        .collect()
}

/// Deletes every cache file except those in `keep`; returns the bytes freed.
/// A file that cannot be deleted (open in another program) is left alone.
pub fn clear(cache_dir: &Path, keep: &[PathBuf]) -> u64 {
    let keep: Vec<PathBuf> = keep.iter().filter_map(|p| p.canonicalize().ok()).collect();
    let mut freed = 0;
    for kind in CacheKind::ALL {
        for (path, size) in files(&cache_dir.join(kind.folder())) {
            let kept = path.canonicalize().is_ok_and(|p| keep.contains(&p));
            if !kept && fs::remove_file(&path).is_ok() {
                freed += size;
            }
        }
    }
    freed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn measures_and_clears_all_but_the_kept_files() {
        let dir = temp_dir("cache-clear");
        fs::create_dir_all(dir.join("audio")).unwrap();
        fs::create_dir_all(dir.join("video")).unwrap();
        fs::write(dir.join("audio/a.flac"), [0; 100]).unwrap();
        fs::write(dir.join("video/b.mp4"), [0; 50]).unwrap();
        fs::write(dir.join("video/c.mp4"), [0; 30]).unwrap();

        let usage = usage(&dir);
        assert_eq!(usage[0].bytes, 100.0);
        assert_eq!((usage[1].bytes, usage[1].files), (80.0, 2));

        assert_eq!(clear(&dir, &[dir.join("video/c.mp4")]), 150);
        assert!(dir.join("video/c.mp4").is_file());
        assert!(!dir.join("audio/a.flac").exists());
    }
}
