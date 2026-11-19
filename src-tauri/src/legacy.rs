//! Moves the files of versions before the library into it, losing nothing.
//!
//! Older versions kept `recent.json`, `diary.json` and the `projects` folder in the data folder,
//! and a `<track>.looplab.json` project file next to each track. They are imported into the
//! library once, at start; a project file beside a track the start did not know of is imported
//! when that track is opened. Nothing is deleted: every old file is moved into the backup folder
//! ("File delle versioni precedenti"), with `origine.txt` saying where each one was.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, params};
use serde::Deserialize;

use crate::db::{self, LibraryError, path_key};
use crate::diary::DiaryEntry;
use crate::hash::fnv1a;
use crate::paths::Places;
use crate::{json_file, log, project, recent};

/// When false, project files beside the tracks are only copied, never moved (the trial copies
/// set it, so the tracks' folders stay as the other copies expect them).
const MOVE_FILES_BESIDE_TRACKS: bool = true;
/// Set once the data folder's old files were imported.
const IMPORTED: &str = "legacy_imported";
const OLD_EXTENSION: &str = "looplab.json";

/// Where the old files are kept, in the backup folder.
pub fn old_files_dir(places: &Places) -> PathBuf {
    places.backup.join("File delle versioni precedenti")
}

#[derive(Default, Deserialize)]
struct OldRecent {
    #[serde(default)]
    entries: Vec<OldRecentEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OldRecentEntry {
    path: String,
    #[serde(default)]
    opened_at: Option<f64>,
    #[serde(default)]
    duration: Option<f64>,
}

#[derive(Default, Deserialize)]
struct OldDiary {
    #[serde(default)]
    entries: Vec<DiaryEntry>,
}

/// `song.mp3` → `song.mp3.looplab.json`, the project file of older versions.
fn beside_track(track: &str) -> PathBuf {
    PathBuf::from(format!("{track}.{OLD_EXTENSION}"))
}

/// The project file older versions kept in the data folder for a track in a read-only folder.
fn in_old_data(dir: &Path, track: &str) -> PathBuf {
    dir.join("projects").join(format!(
        "{:016x}.{OLD_EXTENSION}",
        fnv1a(path_key(track).as_bytes())
    ))
}

/// Copies `file` into `dest` under `name`, noting where it came from; removes the original when
/// `remove` is set. A copy is used rather than a rename so it works across drives too.
fn set_aside(file: &Path, dest: &Path, name: &str, remove: bool) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    fs::copy(file, dest.join(name))?;
    let mut origin = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dest.join("origine.txt"))?;
    writeln!(origin, "{name}\t{}", file.display())?;
    if remove {
        fs::remove_file(file)?;
    }
    Ok(())
}

/// Imports the project file an older version left beside `track`, if there is one, and sets
/// the file aside in `dest`. A damaged file is left where it is and reported as
/// `LibraryError::Invalid`, so the user is told and nothing is saved over it.
pub fn import_beside_track(
    conn: &Connection,
    track: &str,
    dest: &Path,
) -> Result<Option<project::Project>, LibraryError> {
    let file = beside_track(track);
    let Ok(text) = fs::read_to_string(&file) else {
        return Ok(None);
    };
    let project = match project::parse(&text) {
        Ok(project) => project,
        Err(err) => {
            log::error(
                "library",
                &format!("{} not imported: {err}", file.display()),
            );
            return Err(err);
        }
    };
    if project::find(conn, track)?.is_none() {
        let data = serde_json::to_string(&project)?;
        let print = project::fingerprint(Path::new(track));
        project::insert(conn, track, print.as_deref(), &data)?;
    }
    let name = format!(
        "{:016x} {}",
        fnv1a(path_key(track).as_bytes()),
        file.file_name().unwrap_or_default().to_string_lossy()
    );
    if let Err(err) = set_aside(&file, dest, &name, MOVE_FILES_BESIDE_TRACKS) {
        log::error("library", &format!("{} not moved: {err}", file.display()));
    }
    Ok(Some(project))
}

/// Imports, once, the files an older version kept in the data folder and the project files
/// beside the tracks it lists; then moves those files into the backup folder.
pub fn import_old_files(conn: &Connection, places: &Places) -> Result<(), LibraryError> {
    if db::meta(conn, IMPORTED)?.is_some() {
        return Ok(());
    }
    let dir = &places.legacy;
    let dest = old_files_dir(places);
    let old_recent: OldRecent = json_file::read_or_default(&dir.join("recent.json"));
    let old_diary: OldDiary = json_file::read_or_default(&dir.join("diary.json"));

    let tx = conn.unchecked_transaction()?;
    let mut tracks: Vec<String> = Vec::new();
    for entry in &old_recent.entries {
        recent::insert(&tx, &entry.path, entry.opened_at, entry.duration)?;
        tracks.push(entry.path.clone());
    }
    for entry in &old_diary.entries {
        tx.execute(
            "INSERT OR IGNORE INTO diary (day, path_key, path, name, seconds, max_speed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.day,
                path_key(&entry.path),
                entry.path,
                entry.name,
                entry.seconds.max(0.0),
                entry.max_speed
            ],
        )?;
        tracks.push(entry.path.clone());
    }
    tracks.sort_by_key(|track| path_key(track));
    tracks.dedup_by_key(|track| path_key(track));
    for track in &tracks {
        let file = in_old_data(dir, track);
        if let Ok(text) = fs::read_to_string(&file)
            && let Ok(project) = project::parse(&text)
            && project::find(&tx, track)?.is_none()
        {
            let print = project::fingerprint(Path::new(track));
            project::insert(
                &tx,
                track,
                print.as_deref(),
                &serde_json::to_string(&project)?,
            )?;
        }
    }
    db::set_meta(&tx, IMPORTED, Some("1"))?;
    tx.commit()?;

    for track in &tracks {
        // A damaged file stays beside its track: it is reported when that track is opened
        match import_beside_track(conn, track, &dest) {
            Ok(_) | Err(LibraryError::Invalid(_)) => {}
            Err(err) => return Err(err),
        }
    }
    for name in ["recent.json", "diary.json"] {
        let file = dir.join(name);
        if file.is_file()
            && let Err(err) = set_aside(&file, &dest, name, true)
        {
            log::error("library", &format!("{name} not moved: {err}"));
        }
    }
    // The projects of read-only folders: all of them, also those of tracks no list mentions
    if let Ok(found) = fs::read_dir(dir.join("projects")) {
        let dest = dest.join("projects");
        for file in found.flatten().map(|entry| entry.path()) {
            let name = file
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            if let Err(err) = set_aside(&file, &dest, &name, true) {
                log::error("library", &format!("{name} not moved: {err}"));
            }
        }
        let _ = fs::remove_dir(dir.join("projects"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::memory;
    use crate::project::tests::temp_dir;

    #[test]
    fn imports_the_old_files_once_and_keeps_them_aside() {
        let root = temp_dir("legacy-import");
        let places = Places::under(&root.join("data"));
        fs::create_dir_all(places.legacy.join("projects")).unwrap();
        let music = root.join("music");
        fs::create_dir_all(&music).unwrap();
        let beside = music.join("a.mp3").to_string_lossy().into_owned();
        let read_only = music.join("b.mp3").to_string_lossy().into_owned();
        fs::write(&beside, b"a").unwrap();
        fs::write(&read_only, b"b").unwrap();
        fs::write(beside_track(&beside), r#"{ "version": 1, "speed": 0.5 }"#).unwrap();
        fs::write(
            in_old_data(&places.legacy, &read_only),
            r#"{ "version": 1, "speed": 0.75 }"#,
        )
        .unwrap();
        fs::write(
            places.legacy.join("recent.json"),
            format!(
                r#"{{ "entries": [ {{ "path": {:?}, "duration": 60 }}, {{ "path": {:?} }} ] }}"#,
                beside, read_only
            ),
        )
        .unwrap();
        fs::write(
            places.legacy.join("diary.json"),
            format!(
                r#"{{ "entries": [ {{ "day": "2026-11-01", "path": {beside:?}, "name": "a.mp3", "seconds": 90, "maxSpeed": 0.5 }} ] }}"#
            ),
        )
        .unwrap();

        let conn = memory();
        import_old_files(&conn, &places).unwrap();
        import_old_files(&conn, &places).unwrap();

        assert_eq!(project::find(&conn, &beside).unwrap().unwrap().speed, 0.5);
        assert_eq!(
            project::find(&conn, &read_only).unwrap().unwrap().speed,
            0.75
        );
        let recent = recent::list(&conn).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].path, beside, "the old order is kept");
        assert_eq!(recent[0].duration, Some(60.0));
        let diary = crate::diary::list(&conn).unwrap();
        assert_eq!(diary.len(), 1);
        assert_eq!(diary[0].seconds, 90.0);

        // Nothing left behind, nothing lost
        assert!(!beside_track(&beside).exists());
        assert!(!places.legacy.join("recent.json").exists());
        assert!(!places.legacy.join("projects").exists());
        let kept = old_files_dir(&places);
        assert!(kept.join("recent.json").is_file());
        assert!(kept.join("diary.json").is_file());
        assert_eq!(fs::read_dir(kept.join("projects")).unwrap().count(), 2);
        let origin = fs::read_to_string(kept.join("origine.txt")).unwrap();
        assert!(origin.contains("a.mp3.looplab.json"));
    }

    #[test]
    fn imports_a_project_beside_a_track_when_it_is_opened() {
        let root = temp_dir("legacy-open");
        let track = root.join("song.wav").to_string_lossy().into_owned();
        fs::write(&track, b"x").unwrap();
        fs::write(beside_track(&track), r#"{ "version": 1, "speed": 0.9 }"#).unwrap();
        let conn = memory();
        let loaded = project::load(&conn, &track, &root.join("kept")).unwrap();
        assert_eq!(loaded.unwrap().speed, 0.9);
        assert!(!beside_track(&track).exists());
        assert_eq!(project::find(&conn, &track).unwrap().unwrap().speed, 0.9);
    }

    #[test]
    fn leaves_a_damaged_project_file_where_it_is() {
        let root = temp_dir("legacy-damaged");
        let track = root.join("song.wav").to_string_lossy().into_owned();
        fs::write(beside_track(&track), "{ broken").unwrap();
        let conn = memory();
        assert!(matches!(
            import_beside_track(&conn, &track, &root.join("kept")),
            Err(LibraryError::Invalid(_))
        ));
        assert!(beside_track(&track).exists());
        // Opening the track reports it too, and the start's import skips it
        assert!(project::load(&conn, &track, &root.join("kept")).is_err());
    }
}
