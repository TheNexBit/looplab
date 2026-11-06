//! The practice diary: how long each track was practised each day, and how fast.
//! Kept in the app data folder; the UI adds time while a track plays.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::json_file;

const FILE: &str = "diary.json";
/// Oldest entries are dropped past this many (years of daily practice).
const LIMIT: usize = 5_000;

/// Practice of one track on one day.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DiaryEntry {
    /// Local date, "2026-11-06"
    pub day: String,
    pub path: String,
    pub name: String,
    /// Seconds of playback
    pub seconds: f64,
    /// Highest speed played that day (1 = original)
    pub max_speed: f64,
}

#[derive(Default, Serialize, Deserialize)]
struct Stored {
    entries: Vec<DiaryEntry>,
}

pub fn list(data_dir: &Path) -> Vec<DiaryEntry> {
    json_file::read_or_default::<Stored>(&data_dir.join(FILE)).entries
}

/// Adds practice time to the entry of that track and day (Windows paths compare without case).
pub fn record(data_dir: &Path, practice: DiaryEntry) -> std::io::Result<()> {
    let mut entries = list(data_dir);
    match entries
        .iter_mut()
        .find(|e| e.day == practice.day && e.path.eq_ignore_ascii_case(&practice.path))
    {
        Some(entry) => {
            entry.seconds += practice.seconds.max(0.0);
            entry.max_speed = entry.max_speed.max(practice.max_speed);
            entry.name = practice.name;
        }
        None => entries.push(DiaryEntry {
            seconds: practice.seconds.max(0.0),
            ..practice
        }),
    }
    if entries.len() > LIMIT {
        entries.drain(..entries.len() - LIMIT);
    }
    json_file::write(&data_dir.join(FILE), &Stored { entries })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests::temp_dir;

    fn practice(day: &str, path: &str, seconds: f64, max_speed: f64) -> DiaryEntry {
        DiaryEntry {
            day: day.into(),
            path: path.into(),
            name: "song.mp3".into(),
            seconds,
            max_speed,
        }
    }

    #[test]
    fn adds_up_the_same_track_and_day() {
        let dir = temp_dir("diary-sum");
        record(&dir, practice("2026-11-06", r"D:\song.mp3", 30.0, 0.7)).unwrap();
        record(&dir, practice("2026-11-06", r"d:\SONG.mp3", 45.0, 0.8)).unwrap();
        record(&dir, practice("2026-11-07", r"D:\song.mp3", 10.0, 0.6)).unwrap();
        let entries = list(&dir);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].seconds, 75.0);
        assert_eq!(entries[0].max_speed, 0.8);
    }

    #[test]
    fn a_missing_diary_is_empty() {
        assert!(list(&temp_dir("diary-empty")).is_empty());
    }
}
