//! Backups of the library: each one a folder named after its date and kind
//! (`2026-11-13 09.56.01 automatico`) holding a copy of `libreria.db` and of the imported sounds.
//!
//! The copy is SQLite's own (`VACUUM INTO`): consistent even while the app runs, and checked
//! with `integrity_check` before it counts. It is written as `<name>.partial` and renamed only
//! when complete, so a backup cut short never looks like a good one.
//!
//! Automatic backups are made at start and when the day changes; of those, the newest of each
//! of the last 7 days, 4 weeks and 12 months are kept. Manual ones are never deleted; safety
//! ones (made before a restore) keep the last 5. An optional second folder (e.g. an external
//! drive) gets a copy of each backup, pruned the same way.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;

use crate::db::{self, Library, LibraryError};
use crate::log;
use crate::paths::Places;

/// The second backup folder, in the library's `meta` table.
const MIRROR: &str = "backup_mirror";
/// Name of the folder made inside the second backup folder.
const MIRROR_FOLDER: &str = "Looplab Backup";
const PARTIAL: &str = ".partial";
const KEEP_DAYS: usize = 7;
const KEEP_WEEKS: usize = 4;
const KEEP_MONTHS: usize = 12;
const KEEP_SAFETY: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum BackupKind {
    /// Made by the app at start and when the day changes
    Auto,
    /// Asked for with "Backup now": never deleted
    Manual,
    /// Of the state before a restore
    Safety,
}

impl BackupKind {
    /// The word in the folder name.
    fn word(self) -> &'static str {
        match self {
            Self::Auto => "automatico",
            Self::Manual => "manuale",
            Self::Safety => "sicurezza",
        }
    }

    fn from_word(word: &str) -> Option<Self> {
        [Self::Auto, Self::Manual, Self::Safety]
            .into_iter()
            .find(|kind| kind.word() == word)
    }
}

/// One backup, as the settings list it.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    /// Folder name, also its id
    pub name: String,
    pub kind: BackupKind,
    /// Local date, "2026-11-13"
    pub day: String,
    /// Local time, "09:56"
    pub time: String,
    pub bytes: f64,
}

/// "2026-11-13 09.56.01 automatico" (maybe followed by " (2)") → its date, time and kind.
fn parse_name(name: &str) -> Option<(String, String, BackupKind)> {
    let stamp = name.get(..19)?;
    let bytes = stamp.as_bytes();
    let digits = [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18];
    if !digits.iter().all(|&i| bytes[i].is_ascii_digit())
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b' '
        || bytes[13] != b'.'
        || bytes[16] != b'.'
    {
        return None;
    }
    let kind = BackupKind::from_word(name.get(20..)?.split(' ').next()?)?;
    Some((
        stamp[..10].to_owned(),
        format!("{}:{}", &stamp[11..13], &stamp[14..16]),
        kind,
    ))
}

/// Days since 1970-01-01 of a "2026-11-13" date (proleptic Gregorian calendar).
fn day_number(day: &str) -> i64 {
    let part = |range: std::ops::Range<usize>| day.get(range).and_then(|s| s.parse::<i64>().ok());
    let (Some(y), Some(m), Some(d)) = (part(0..4), part(5..7), part(8..10)) else {
        return 0;
    };
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let year_of_era = y - era * 400;
    let day_of_year = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Weeks counted from Monday (1970-01-01 was a Thursday).
fn week_number(day: &str) -> i64 {
    (day_number(day) + 3).div_euclid(7)
}

/// Local date and time now, "2026-11-13 09.56.01" (SQLite knows the local time zone).
pub fn local_stamp(conn: &Connection) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT strftime('%Y-%m-%d %H.%M.%S', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )
}

fn folder_bytes(dir: &Path) -> u64 {
    fs::read_dir(dir).map_or(0, |entries| {
        entries
            .flatten()
            .map(|entry| match entry.metadata() {
                Ok(meta) if meta.is_dir() => folder_bytes(&entry.path()),
                Ok(meta) => meta.len(),
                Err(_) => 0,
            })
            .sum()
    })
}

/// The backups in `dir`, newest first.
pub fn list(dir: &Path) -> Vec<BackupInfo> {
    let mut found: Vec<BackupInfo> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let (day, time, kind) = parse_name(&name)?;
            Some(BackupInfo {
                bytes: folder_bytes(&entry.path()) as f64,
                name,
                kind,
                day,
                time,
            })
        })
        .collect();
    found.sort_by(|a, b| b.name.cmp(&a.name));
    found
}

/// Which backups to delete: automatic ones beyond the newest of each of the last days, weeks
/// and months, and safety ones beyond the last few. `backups` is newest first.
fn to_prune(backups: &[BackupInfo]) -> Vec<&BackupInfo> {
    let autos: Vec<&BackupInfo> = backups
        .iter()
        .filter(|b| b.kind == BackupKind::Auto)
        .collect();
    let mut keep = std::collections::HashSet::new();
    let mut newest_per = |key: &dyn Fn(&BackupInfo) -> i64, count: usize| {
        let mut seen = Vec::new();
        for backup in &autos {
            let k = key(backup);
            if !seen.contains(&k) {
                if seen.len() == count {
                    break;
                }
                seen.push(k);
                keep.insert(backup.name.clone());
            }
        }
    };
    newest_per(&|b| day_number(&b.day), KEEP_DAYS);
    newest_per(&|b| week_number(&b.day), KEEP_WEEKS);
    newest_per(
        &|b| {
            b.day
                .get(..7)
                .unwrap_or_default()
                .replace('-', "")
                .parse()
                .unwrap_or(0)
        },
        KEEP_MONTHS,
    );
    let mut safety = 0;
    backups
        .iter()
        .filter(|b| match b.kind {
            BackupKind::Auto => !keep.contains(&b.name),
            BackupKind::Manual => false,
            BackupKind::Safety => {
                safety += 1;
                safety > KEEP_SAFETY
            }
        })
        .collect()
}

/// Deletes the backups past their time, and any left half-made by a crash.
fn prune(dir: &Path) {
    for backup in to_prune(&list(dir)) {
        if let Err(err) = fs::remove_dir_all(dir.join(&backup.name)) {
            log::error("backup", &format!("{} not deleted: {err}", backup.name));
        }
    }
    for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
        if entry.file_name().to_string_lossy().ends_with(PARTIAL) {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

/// Copies the files of `from` (no subfolders: the sounds folder has none) into `to`.
fn copy_files(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from).into_iter().flatten().flatten() {
        if entry.path().is_file() {
            fs::copy(entry.path(), to.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// Copies a whole backup folder (the database and its `suoni` folder).
fn copy_backup(from: &Path, to: &Path) -> std::io::Result<()> {
    copy_files(from, to)?;
    let sounds = from.join("suoni");
    if sounds.is_dir() {
        copy_files(&sounds, &to.join("suoni"))?;
    }
    Ok(())
}

/// True if the backup folder holds a library SQLite finds intact.
fn is_sound(dir: &Path) -> bool {
    db::open_read_only(&dir.join(db::FILE)).is_ok_and(|conn| db::is_healthy(&conn))
}

/// The second backup folder chosen by the user, if any.
pub fn mirror(conn: &Connection) -> rusqlite::Result<Option<PathBuf>> {
    Ok(db::meta(conn, MIRROR)?.map(|dir| PathBuf::from(dir).join(MIRROR_FOLDER)))
}

/// Chooses (or with `None` stops using) a second backup folder.
pub fn set_mirror(conn: &Connection, dir: Option<&str>) -> rusqlite::Result<()> {
    db::set_meta(conn, MIRROR, dir)
}

/// What a new backup reports.
pub struct Made {
    pub info: BackupInfo,
    /// Why the copy in the second folder failed, if it did
    pub mirror_error: Option<String>,
}

/// Makes a backup of the library and the sounds, then prunes the old ones.
pub fn create(conn: &Connection, places: &Places, kind: BackupKind) -> Result<Made, LibraryError> {
    fs::create_dir_all(&places.backup)?;
    let stamp = local_stamp(conn)?;
    let mut name = format!("{stamp} {}", kind.word());
    let mut n = 2;
    while places.backup.join(&name).exists() {
        name = format!("{stamp} {} ({n})", kind.word());
        n += 1;
    }
    let partial = places.backup.join(format!("{name}{PARTIAL}"));
    let _ = fs::remove_dir_all(&partial);
    fs::create_dir_all(&partial)?;
    let made = (|| -> Result<(), LibraryError> {
        conn.execute("VACUUM INTO ?1", [partial.join(db::FILE).to_string_lossy()])?;
        if !is_sound(&partial) {
            return Err(LibraryError::Other(
                "the backup copy failed its check".into(),
            ));
        }
        let sounds = places.sounds();
        if sounds.is_dir() {
            copy_files(&sounds, &partial.join("suoni"))?;
        }
        Ok(())
    })();
    if let Err(err) = made {
        let _ = fs::remove_dir_all(&partial);
        return Err(err);
    }
    let folder = places.backup.join(&name);
    fs::rename(&partial, &folder)?;
    prune(&places.backup);

    let mirror_error = match mirror(conn)? {
        Some(dir) => copy_backup(&folder, &dir.join(&name))
            .map(|()| prune(&dir))
            .err()
            .map(|err| {
                log::error(
                    "backup",
                    &format!("copy in {} failed: {err}", dir.display()),
                );
                err.to_string()
            }),
        None => None,
    };
    let info = list(&places.backup)
        .into_iter()
        .find(|b| b.name == name)
        .ok_or_else(|| LibraryError::Other("backup not found after making it".into()))?;
    Ok(Made { info, mirror_error })
}

/// Makes the day's automatic backup, unless there is one already.
pub fn auto_if_due(library: &Library) {
    let result = library.with(|conn| {
        let today = local_stamp(conn)?[..10].to_owned();
        let done = list(&library.places().backup)
            .iter()
            .any(|b| b.kind == BackupKind::Auto && b.day == today);
        if !done {
            create(conn, library.places(), BackupKind::Auto)?;
        }
        Ok(())
    });
    if let Err(err) = result {
        log::error("backup", &format!("automatic backup failed: {err}"));
    }
}

/// Puts a backup back: the current state is first saved as a safety backup.
pub fn restore(library: &Library, name: &str) -> Result<(), LibraryError> {
    let places = library.places().clone();
    if parse_name(name).is_none() || name.contains(['/', '\\']) {
        return Err(LibraryError::Other(format!("not a backup: {name}")));
    }
    let source = places.backup.join(name);
    if !is_sound(&source) {
        return Err(LibraryError::Invalid(format!("backup {name} is damaged")));
    }
    let file = library.file();
    library.reopen_after(|conn| {
        create(&conn, &places, BackupKind::Safety)?;
        drop(conn);
        let temporary = file.with_extension("db.ripristino");
        fs::copy(source.join(db::FILE), &temporary)?;
        fs::rename(&temporary, &file)?;
        let sounds = places.sounds();
        let _ = fs::remove_dir_all(&sounds);
        if source.join("suoni").is_dir() {
            copy_files(&source.join("suoni"), &sounds)?;
        }
        Ok(())
    })
}

/// At start, when the library is damaged: sets it aside in the backup folder and puts back the
/// newest intact backup. Returns the opened library and the backup used (`None`: none was
/// intact, so a new empty library was made — the damaged file is still kept).
pub fn recover(places: &Places, file: &Path) -> Result<(Connection, Option<String>), LibraryError> {
    let stamp = local_stamp(&Connection::open_in_memory()?)?;
    if file.exists() {
        let aside = places.backup.join(format!("Archivio danneggiato {stamp}"));
        fs::create_dir_all(&aside)?;
        for suffix in ["", "-journal", "-wal", "-shm"] {
            let part = PathBuf::from(format!("{}{suffix}", file.display()));
            if part.exists() {
                let target = aside.join(part.file_name().unwrap_or_default());
                fs::copy(&part, target)?;
                fs::remove_file(&part)?;
            }
        }
    }
    for backup in list(&places.backup) {
        let dir = places.backup.join(&backup.name);
        if is_sound(&dir) {
            fs::copy(dir.join(db::FILE), file)?;
            let conn = db::open(file).map_err(|e| LibraryError::Other(e.to_string()))?;
            log::error(
                "library",
                &format!("library recovered from backup {}", backup.name),
            );
            return Ok((conn, Some(backup.name)));
        }
    }
    let conn = db::open(file).map_err(|e| LibraryError::Other(e.to_string()))?;
    Ok((conn, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests::temp_dir;

    fn info(name: &str) -> BackupInfo {
        let (day, time, kind) = parse_name(name).unwrap();
        BackupInfo {
            name: name.into(),
            kind,
            day,
            time,
            bytes: 0.0,
        }
    }

    #[test]
    fn reads_the_folder_names() {
        let (day, time, kind) = parse_name("2026-11-13 09.56.01 manuale (2)").unwrap();
        assert_eq!(
            (day.as_str(), time.as_str(), kind),
            ("2026-11-13", "09:56", BackupKind::Manual)
        );
        assert!(parse_name("File delle versioni precedenti").is_none());
        assert!(parse_name("2026-11-13 09.56.01 strano").is_none());
        assert!(parse_name("2026-11-13 09.56.01 automatico.partial").is_none());
    }

    #[test]
    fn counts_days_and_weeks_like_the_calendar() {
        assert_eq!(day_number("1970-01-01"), 0);
        assert_eq!(day_number("2026-11-13"), 20_770);
        assert_eq!(
            day_number("2024-03-01") - day_number("2024-02-28"),
            2,
            "leap year"
        );
        // Sunday 15 and Monday 16 November 2026 fall in different weeks
        assert_eq!(week_number("2026-11-13"), week_number("2026-11-15"));
        assert_ne!(week_number("2026-11-15"), week_number("2026-11-16"));
    }

    #[test]
    fn keeps_days_weeks_and_months_and_every_manual_backup() {
        let mut names = Vec::new();
        // Two automatic backups a day for 400 days, newest first
        for n in 0..400 {
            let day = day_number("2026-11-13") - n;
            let (y, m, d) = civil(day);
            names.push(format!("{y:04}-{m:02}-{d:02} 20.00.00 automatico"));
            names.push(format!("{y:04}-{m:02}-{d:02} 08.00.00 automatico"));
        }
        names.push("2020-01-01 10.00.00 manuale".into());
        for n in 0..8 {
            names.push(format!("2025-01-0{} 10.00.00 sicurezza", n + 1));
        }
        names.sort_by(|a, b| b.cmp(a));
        let backups: Vec<BackupInfo> = names.iter().map(|n| info(n)).collect();
        let pruned: Vec<&str> = to_prune(&backups).iter().map(|b| b.name.as_str()).collect();
        let kept: Vec<&BackupInfo> = backups
            .iter()
            .filter(|b| !pruned.contains(&b.name.as_str()))
            .collect();
        let autos = kept.iter().filter(|b| b.kind == BackupKind::Auto).count();
        assert!(
            (12..=KEEP_DAYS + KEEP_WEEKS + KEEP_MONTHS).contains(&autos),
            "{autos}"
        );
        assert!(
            kept.iter()
                .any(|b| b.name == "2026-11-13 20.00.00 automatico")
        );
        assert!(
            !kept
                .iter()
                .any(|b| b.name == "2026-11-13 08.00.00 automatico")
        );
        assert!(kept.iter().any(|b| b.kind == BackupKind::Manual));
        assert_eq!(
            kept.iter().filter(|b| b.kind == BackupKind::Safety).count(),
            KEEP_SAFETY
        );
    }

    /// The date of a day number (inverse of `day_number`), for the tests.
    fn civil(days: i64) -> (i64, i64, i64) {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        (yoe + era * 400 + i64::from(m <= 2), m, d)
    }

    fn places(name: &str) -> Places {
        let root = temp_dir(name);
        let places = Places::under(&root);
        fs::create_dir_all(places.sounds()).unwrap();
        fs::write(places.sounds().join("clap.wav"), b"RIFF").unwrap();
        places
    }

    #[test]
    fn a_backup_holds_a_checked_library_and_the_sounds() {
        let places = places("backup-create");
        let conn = db::open(&places.user.join(db::FILE)).unwrap();
        crate::prefs::set(&conn, "k", Some("1")).unwrap();
        let mirror_root = places.user.join("external");
        set_mirror(&conn, Some(&mirror_root.to_string_lossy())).unwrap();
        let made = create(&conn, &places, BackupKind::Manual).unwrap();
        assert!(made.mirror_error.is_none());
        let folder = places.backup.join(&made.info.name);
        assert!(is_sound(&folder));
        assert!(folder.join("suoni").join("clap.wav").is_file());
        assert!(made.info.bytes > 0.0);
        let copy = mirror_root.join(MIRROR_FOLDER).join(&made.info.name);
        assert!(is_sound(&copy) && copy.join("suoni").join("clap.wav").is_file());
        // Two in the same second get different names
        let again = create(&conn, &places, BackupKind::Manual).unwrap();
        assert_ne!(again.info.name, made.info.name);
    }

    #[test]
    fn restore_puts_back_the_library_and_keeps_a_safety_copy() {
        let places = places("backup-restore");
        let library = Library::start(places.clone());
        library
            .with(|conn| crate::prefs::set(conn, "k", Some("\"old\"")))
            .unwrap();
        let made = library
            .with(|conn| create(conn, &places, BackupKind::Manual))
            .unwrap();
        library
            .with(|conn| crate::prefs::set(conn, "k", Some("\"new\"")))
            .unwrap();
        fs::remove_file(places.sounds().join("clap.wav")).unwrap();

        restore(&library, &made.info.name).unwrap();
        let (values, _) = library.with(crate::prefs::all).unwrap();
        assert_eq!(values["k"], "\"old\"");
        assert!(places.sounds().join("clap.wav").is_file());
        assert!(
            list(&places.backup)
                .iter()
                .any(|b| b.kind == BackupKind::Safety)
        );
        assert!(restore(&library, "../escape").is_err());
    }

    #[test]
    fn a_damaged_library_is_set_aside_and_the_last_good_backup_used() {
        let places = places("backup-recover");
        let file = places.user.join(db::FILE);
        let conn = db::open(&file).unwrap();
        crate::prefs::set(&conn, "k", Some("7")).unwrap();
        create(&conn, &places, BackupKind::Auto).unwrap();
        drop(conn);
        fs::write(&file, vec![9u8; 8192]).unwrap();

        let library = Library::start(places.clone());
        assert!(library.recovered().is_some());
        let (values, _) = library.with(crate::prefs::all).unwrap();
        assert_eq!(values["k"], "7");
        let aside = fs::read_dir(&places.backup).unwrap().flatten().any(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("Archivio danneggiato")
        });
        assert!(aside, "the damaged file is kept");
    }
}
