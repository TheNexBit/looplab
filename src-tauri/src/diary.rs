//! The practice diary: how long each track was practised each day, and how fast.
//! Kept in the library; the UI adds time while a track plays.

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

use crate::db::{LibraryError, path_key};

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

/// Every entry, oldest first.
pub fn list(conn: &Connection) -> Result<Vec<DiaryEntry>, LibraryError> {
    let mut query =
        conn.prepare("SELECT day, path, name, seconds, max_speed FROM diary ORDER BY day, rowid")?;
    let entries = query
        .query_map([], |row| {
            Ok(DiaryEntry {
                day: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                seconds: row.get(3)?,
                max_speed: row.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(entries)
}

/// Adds practice time to the entry of that track and day (Windows paths compare without case).
pub fn record(conn: &Connection, practice: &DiaryEntry) -> Result<(), LibraryError> {
    conn.execute(
        "INSERT INTO diary (day, path_key, path, name, seconds, max_speed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT (day, path_key) DO UPDATE SET
             seconds = diary.seconds + excluded.seconds,
             max_speed = max(diary.max_speed, excluded.max_speed),
             name = excluded.name, path = excluded.path",
        params![
            practice.day,
            path_key(&practice.path),
            practice.path,
            practice.name,
            practice.seconds.max(0.0),
            practice.max_speed
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::memory;

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
        let conn = memory();
        record(&conn, &practice("2026-11-06", r"D:\song.mp3", 30.0, 0.7)).unwrap();
        record(&conn, &practice("2026-11-06", r"d:\SONG.mp3", 45.0, 0.8)).unwrap();
        record(&conn, &practice("2026-11-07", r"D:\song.mp3", 10.0, 0.6)).unwrap();
        record(&conn, &practice("2026-11-07", r"D:\song.mp3", -5.0, 0.5)).unwrap();
        let entries = list(&conn).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].seconds, 75.0);
        assert_eq!(entries[0].max_speed, 0.8);
        assert_eq!(entries[1].seconds, 10.0);
    }

    #[test]
    fn a_new_diary_is_empty() {
        assert!(list(&memory()).unwrap().is_empty());
    }
}
