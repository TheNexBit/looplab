//! The list of recently opened tracks, kept in the app data folder.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::json_file;

const FILE: &str = "recent.json";
pub const LIMIT: usize = 10;

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    /// False when the file has been moved or deleted since
    pub exists: bool,
}

#[derive(Default, Serialize, Deserialize)]
struct Stored {
    paths: Vec<String>,
}

fn read(data_dir: &Path) -> Vec<String> {
    json_file::read_or_default::<Stored>(&data_dir.join(FILE)).paths
}

fn write(data_dir: &Path, paths: Vec<String>) -> std::io::Result<()> {
    json_file::write(&data_dir.join(FILE), &Stored { paths })
}

/// Most recent first, at most `LIMIT`.
pub fn list(data_dir: &Path) -> Vec<RecentFile> {
    read(data_dir)
        .into_iter()
        .map(|path| {
            let file = Path::new(&path);
            RecentFile {
                name: file
                    .file_name()
                    .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned()),
                exists: file.is_file(),
                path,
            }
        })
        .collect()
}

/// Moves `path` to the top of the list (Windows paths compare without case).
pub fn add(data_dir: &Path, path: &str) -> std::io::Result<()> {
    let mut paths = read(data_dir);
    paths.retain(|p| !p.eq_ignore_ascii_case(path));
    paths.insert(0, path.to_owned());
    paths.truncate(LIMIT);
    write(data_dir, paths)
}

pub fn remove(data_dir: &Path, path: &str) -> std::io::Result<()> {
    let mut paths = read(data_dir);
    paths.retain(|p| !p.eq_ignore_ascii_case(path));
    write(data_dir, paths)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn newest_first_without_duplicates() {
        let dir = temp_dir("recent-order");
        add(&dir, r"D:\a.mp3").unwrap();
        add(&dir, r"D:\b.mp3").unwrap();
        add(&dir, r"d:\A.MP3").unwrap();
        let names: Vec<String> = list(&dir).into_iter().map(|r| r.path).collect();
        assert_eq!(names, [r"d:\A.MP3", r"D:\b.mp3"]);
    }

    #[test]
    fn keeps_at_most_the_limit() {
        let dir = temp_dir("recent-limit");
        for i in 0..LIMIT + 5 {
            add(&dir, &format!(r"D:\song{i}.mp3")).unwrap();
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
        add(&dir, real.to_str().unwrap()).unwrap();
        add(&dir, r"D:\nowhere\gone.mp3").unwrap();
        let recent = list(&dir);
        assert!(!recent[0].exists && recent[1].exists);
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
}
