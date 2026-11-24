//! The list of recently opened tracks, kept in the library, with what the start screen shows
//! about each one (when it was opened, its length, what its project holds).

use std::path::Path;

use rusqlite::{Connection, params};
use serde::Serialize;

use crate::db::{LibraryError, path_key};
use crate::project;

/// The start screen is mostly this list: room for a good number of tracks
pub const LIMIT: usize = 30;

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    /// False when the file has been moved or deleted since
    pub exists: bool,
    /// When it was last opened, in seconds since 1970
    pub opened_at: Option<f64>,
    /// Length in seconds, as announced when it was last opened
    pub duration: Option<f64>,
    /// From the track's project, when it has one
    pub saved_loops: u32,
    pub sections: u32,
    /// Last speed used (1 = original); `None` without a project
    pub speed: Option<f64>,
}

/// Most recent first (entries of old versions without a time keep their order), at most `LIMIT`.
pub fn list(conn: &Connection) -> Result<Vec<RecentFile>, LibraryError> {
    let mut query = conn.prepare(
        "SELECT recent.path, recent.opened_at, recent.duration, projects.data
         FROM recent LEFT JOIN projects ON projects.path_key = recent.path_key
         ORDER BY recent.opened_at IS NULL, recent.opened_at DESC, recent.rowid
         LIMIT ?1",
    )?;
    let rows = query.query_map([LIMIT as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<f64>>(1)?,
            row.get::<_, Option<f64>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    let mut recent = Vec::new();
    for row in rows {
        let (path, opened_at, duration, data) = row?;
        let file = Path::new(&path);
        // A damaged project only loses its details here, never the entry
        let saved = data.and_then(|json| project::parse(&json).ok());
        recent.push(RecentFile {
            name: file
                .file_name()
                .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned()),
            exists: file.is_file(),
            opened_at,
            duration,
            saved_loops: saved.as_ref().map_or(0, |p| p.loops.len() as u32),
            sections: saved.as_ref().map_or(0, |p| p.sections.len() as u32),
            speed: saved.as_ref().map(|p| p.speed),
            path,
        });
    }
    Ok(recent)
}

/// Adds an entry as it was (used when importing the list of an older version).
pub fn insert(
    conn: &Connection,
    path: &str,
    opened_at: Option<f64>,
    duration: Option<f64>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO recent (path_key, path, opened_at, duration) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (path_key) DO UPDATE SET path = excluded.path,
             opened_at = excluded.opened_at,
             duration = COALESCE(excluded.duration, recent.duration)",
        params![path_key(path), path, opened_at, duration],
    )?;
    Ok(())
}

/// Two lengths this close are the same recording (the decoders round differently).
const SAME_LENGTH: f64 = 0.05;

/// Drops the entries `path` was moved from: gone from disk, same file name and same length.
/// (A file with a project is also followed by its content, `project::find_by_content`.)
fn forget_moved_twins(
    conn: &Connection,
    path: &str,
    duration: Option<f64>,
) -> Result<(), LibraryError> {
    let Some(duration) = duration else {
        return Ok(());
    };
    let name_of = |p: &str| {
        Path::new(p)
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
    };
    let name = name_of(path);
    let mut query = conn.prepare(
        "SELECT path, duration FROM recent WHERE path_key != ?1 AND duration IS NOT NULL",
    )?;
    let twins: Vec<String> = query
        .query_map([path_key(path)], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|(old, length)| {
            (length - duration).abs() < SAME_LENGTH
                && name_of(old) == name
                && !Path::new(old).exists()
        })
        .map(|(old, _)| old)
        .collect();
    for old in twins {
        remove(conn, &old)?;
    }
    Ok(())
}

/// Moves `path` to the top of the list (Windows paths compare without case), noting the
/// time and its `duration`.
pub fn add(conn: &Connection, path: &str, duration: Option<f64>) -> Result<(), LibraryError> {
    insert(conn, path, Some(project::now()), duration)?;
    forget_moved_twins(conn, path, duration)?;
    conn.execute(
        "DELETE FROM recent WHERE path_key NOT IN (
             SELECT path_key FROM recent
             ORDER BY opened_at IS NULL, opened_at DESC, rowid LIMIT ?1)",
        [LIMIT as i64],
    )?;
    Ok(())
}

pub fn remove(conn: &Connection, path: &str) -> Result<(), LibraryError> {
    conn.execute("DELETE FROM recent WHERE path_key = ?1", [path_key(path)])?;
    Ok(())
}

/// Empties the list (`only_missing`: just the files no longer on the disk). The tracks' projects,
/// diary and files are not touched. Returns how many were taken off.
pub fn clear(conn: &Connection, only_missing: bool) -> Result<usize, LibraryError> {
    if !only_missing {
        return Ok(conn.execute("DELETE FROM recent", [])?);
    }
    let mut removed = 0;
    for file in list(conn)?.into_iter().filter(|file| !file.exists) {
        remove(conn, &file.path)?;
        removed += 1;
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::db::tests::memory;
    use crate::project::tests::temp_dir;

    #[test]
    fn a_moved_file_without_project_leaves_no_crossed_out_twin() {
        let dir = temp_dir("recent-moved");
        let conn = memory();
        let old = dir.join("basso.wav");
        let kept = dir.join("other").join("basso.wav");
        fs::create_dir_all(kept.parent().unwrap()).unwrap();
        fs::write(&kept, b"x").unwrap();
        let old = old.to_string_lossy().into_owned();
        let kept = kept.to_string_lossy().into_owned();
        // A file still on disk, or of another length, is another file: it stays
        add(&conn, &kept, Some(10.0)).unwrap();
        add(&conn, &old, Some(42.0)).unwrap();
        let new = dir
            .join("moved")
            .join("basso.wav")
            .to_string_lossy()
            .into_owned();
        add(&conn, &new, Some(42.01)).unwrap();
        let paths: Vec<String> = list(&conn).unwrap().into_iter().map(|f| f.path).collect();
        assert_eq!(paths, [new, kept]);
    }

    #[test]
    fn newest_first_without_duplicates() {
        let conn = memory();
        add(&conn, r"D:\a.mp3", None).unwrap();
        add(&conn, r"D:\b.mp3", None).unwrap();
        add(&conn, r"d:\A.MP3", None).unwrap();
        let names: Vec<String> = list(&conn).unwrap().into_iter().map(|r| r.path).collect();
        assert_eq!(names, [r"d:\A.MP3", r"D:\b.mp3"]);
    }

    #[test]
    fn clears_all_or_only_the_missing_files() {
        let dir = temp_dir("recent-clear");
        let here = dir.join("here.mp3");
        fs::write(&here, b"x").unwrap();
        let conn = memory();
        add(&conn, &here.to_string_lossy(), None).unwrap();
        add(&conn, r"Z:\gone\away.mp3", None).unwrap();
        assert_eq!(clear(&conn, true).unwrap(), 1);
        let left: Vec<String> = list(&conn).unwrap().into_iter().map(|r| r.path).collect();
        assert_eq!(left, [here.to_string_lossy().into_owned()]);
        assert_eq!(clear(&conn, false).unwrap(), 1);
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn keeps_at_most_the_limit() {
        let conn = memory();
        for i in 0..LIMIT + 5 {
            add(&conn, &format!(r"D:\song{i}.mp3"), None).unwrap();
        }
        let recent = list(&conn).unwrap();
        assert_eq!(recent.len(), LIMIT);
        assert_eq!(recent[0].name, format!("song{}.mp3", LIMIT + 4));
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM recent", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, LIMIT as i64);
    }

    #[test]
    fn reports_missing_files_and_removes_them() {
        let dir = temp_dir("recent-missing");
        let conn = memory();
        let real = dir.join("real.wav");
        fs::write(&real, b"x").unwrap();
        add(&conn, real.to_str().unwrap(), Some(42.0)).unwrap();
        add(&conn, r"D:\nowhere\gone.mp3", None).unwrap();
        let recent = list(&conn).unwrap();
        assert!(!recent[0].exists && recent[1].exists);
        assert_eq!(recent[1].duration, Some(42.0));
        assert!(recent[1].opened_at.is_some());
        remove(&conn, r"D:\nowhere\gone.mp3").unwrap();
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn shows_what_the_project_holds() {
        let conn = memory();
        let project = project::Project {
            speed: 0.8,
            ..project::Project::default()
        };
        project::save(&conn, r"D:\x.mp3", &project).unwrap();
        add(&conn, r"D:\x.mp3", None).unwrap();
        assert_eq!(list(&conn).unwrap()[0].speed, Some(0.8));
    }
}
