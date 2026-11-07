//! The list of recently opened tracks, kept in the app data folder, with what the start
//! screen shows about each one (when it was opened, its length, what its project holds).

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::{json_file, project};

const FILE: &str = "recent.json";
/// The start screen is mostly this list: room for a good number of tracks
pub const LIMIT: usize = 30;

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    /// False when the file has been moved or deleted since
    pub exists: bool,
    /// When it was last opened, in seconds since 1970 (unknown for lists of older versions)
    pub opened_at: Option<f64>,
    /// Length in seconds, as announced when it was last opened
    pub duration: Option<f64>,
    /// From the track's project, when it has one
    pub saved_loops: u32,
    pub sections: u32,
    /// Last speed used (1 = original); `None` without a project
    pub speed: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    path: String,
    #[serde(default)]
    opened_at: Option<f64>,
    #[serde(default)]
    duration: Option<f64>,
}

#[derive(Default, Serialize, Deserialize)]
struct Stored {
    /// How versions before the details kept the list: paths only
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    paths: Vec<String>,
    #[serde(default)]
    entries: Vec<Entry>,
}

fn read(data_dir: &Path) -> Vec<Entry> {
    let stored = json_file::read_or_default::<Stored>(&data_dir.join(FILE));
    if !stored.entries.is_empty() {
        return stored.entries;
    }
    let old = stored.paths.into_iter();
    old.map(|path| Entry {
        path,
        opened_at: None,
        duration: None,
    })
    .collect()
}

fn write(data_dir: &Path, entries: Vec<Entry>) -> std::io::Result<()> {
    json_file::write(
        &data_dir.join(FILE),
        &Stored {
            paths: Vec::new(),
            entries,
        },
    )
}

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64())
}

/// Most recent first, at most `LIMIT`.
pub fn list(data_dir: &Path) -> Vec<RecentFile> {
    read(data_dir)
        .into_iter()
        .map(|entry| {
            let file = Path::new(&entry.path);
            let exists = file.is_file();
            // A damaged project only loses its details here, never the entry
            let saved = if exists {
                project::load(data_dir, file).ok().flatten().map(|(p, _)| p)
            } else {
                None
            };
            RecentFile {
                name: file
                    .file_name()
                    .map_or_else(|| entry.path.clone(), |n| n.to_string_lossy().into_owned()),
                exists,
                opened_at: entry.opened_at,
                duration: entry.duration,
                saved_loops: saved.as_ref().map_or(0, |p| p.loops.len() as u32),
                sections: saved.as_ref().map_or(0, |p| p.sections.len() as u32),
                speed: saved.as_ref().map(|p| p.speed),
                path: entry.path,
            }
        })
        .collect()
}

/// Moves `path` to the top of the list (Windows paths compare without case), noting the
/// time and its `duration`.
pub fn add(data_dir: &Path, path: &str, duration: Option<f64>) -> std::io::Result<()> {
    let mut entries = read(data_dir);
    entries.retain(|e| !e.path.eq_ignore_ascii_case(path));
    entries.insert(
        0,
        Entry {
            path: path.to_owned(),
            opened_at: Some(now()),
            duration,
        },
    );
    entries.truncate(LIMIT);
    write(data_dir, entries)
}

pub fn remove(data_dir: &Path, path: &str) -> std::io::Result<()> {
    let mut entries = read(data_dir);
    entries.retain(|e| !e.path.eq_ignore_ascii_case(path));
    write(data_dir, entries)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn newest_first_without_duplicates() {
        let dir = temp_dir("recent-order");
        add(&dir, r"D:\a.mp3", None).unwrap();
        add(&dir, r"D:\b.mp3", None).unwrap();
        add(&dir, r"d:\A.MP3", None).unwrap();
        let names: Vec<String> = list(&dir).into_iter().map(|r| r.path).collect();
        assert_eq!(names, [r"d:\A.MP3", r"D:\b.mp3"]);
    }

    #[test]
    fn keeps_at_most_the_limit() {
        let dir = temp_dir("recent-limit");
        for i in 0..LIMIT + 5 {
            add(&dir, &format!(r"D:\song{i}.mp3"), None).unwrap();
        }
        let recent = list(&dir);
        assert_eq!(recent.len(), LIMIT);
        assert_eq!(recent[0].name, format!("song{}.mp3", LIMIT + 4));
    }

    #[test]
    fn reports_missing_files_and_removes_them() {
        let dir = temp_dir("recent-missing");
        let real = dir.join("real.wav");
        fs::write(&real, b"x").unwrap();
        add(&dir, real.to_str().unwrap(), Some(42.0)).unwrap();
        add(&dir, r"D:\nowhere\gone.mp3", None).unwrap();
        let recent = list(&dir);
        assert!(!recent[0].exists && recent[1].exists);
        assert_eq!(recent[1].duration, Some(42.0));
        assert!(recent[1].opened_at.is_some());
        remove(&dir, r"D:\nowhere\gone.mp3").unwrap();
        assert_eq!(list(&dir).len(), 1);
    }

    #[test]
    fn a_missing_or_broken_list_is_empty() {
        let dir = temp_dir("recent-broken");
        assert!(list(&dir).is_empty());
        fs::write(dir.join(FILE), "{ broken").unwrap();
        assert!(list(&dir).is_empty());
    }

    #[test]
    fn reads_the_list_of_older_versions() {
        let dir = temp_dir("recent-old");
        fs::write(dir.join(FILE), r#"{"paths":["D:\\old.mp3"]}"#).unwrap();
        let recent = list(&dir);
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].path, r"D:\old.mp3");
        assert_eq!(recent[0].opened_at, None);
        add(&dir, r"D:\new.mp3", Some(10.0)).unwrap();
        assert_eq!(list(&dir).len(), 2);
    }
}
