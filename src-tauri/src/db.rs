//! The library: one SQLite database (`libreria.db`) holding all of the player's work —
//! track projects, recent tracks, practice diary and preferences.
//!
//! One file is easy to back up and to restore, and SQLite never leaves it half written: every
//! change is a transaction, flushed to disk before it counts (`synchronous = FULL`). The schema
//! version is the database's `user_version`; `upgrade` brings older files up to date.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags, OptionalExtension, params};

use crate::paths::Places;
use crate::{backup, legacy, log};

/// The library file, in the user folder.
pub const FILE: &str = "libreria.db";
/// Bumped (with a step in `upgrade`) whenever the tables change.
const SCHEMA: i32 = 1;

const SCHEMA_1: &str = "
CREATE TABLE projects (
    path_key    TEXT PRIMARY KEY,   -- full path, lower case: Windows paths ignore case
    path        TEXT NOT NULL,
    fingerprint TEXT,               -- size + start and end of the file: finds moved tracks
    data        TEXT NOT NULL,      -- the Project as JSON (schema in project.rs)
    updated_at  REAL NOT NULL
);
CREATE INDEX projects_fingerprint ON projects (fingerprint);
CREATE TABLE recent (
    path_key  TEXT PRIMARY KEY,
    path      TEXT NOT NULL,
    opened_at REAL,
    duration  REAL
);
CREATE TABLE diary (
    day       TEXT NOT NULL,        -- local date, 2026-11-13
    path_key  TEXT NOT NULL,
    path      TEXT NOT NULL,
    name      TEXT NOT NULL,
    seconds   REAL NOT NULL,
    max_speed REAL NOT NULL,
    PRIMARY KEY (day, path_key)
);
CREATE TABLE prefs (
    key   TEXT PRIMARY KEY,         -- the UI's preference keys
    value TEXT NOT NULL             -- JSON
);
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
";

/// Why the library could not be opened.
#[derive(Debug)]
pub enum OpenError {
    /// Written by a newer Looplab: left untouched
    Newer(i32),
    /// Unreadable or damaged
    Damaged(String),
}

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Newer(version) => write!(f, "library written by a newer Looplab ({version})"),
            Self::Damaged(detail) => write!(f, "damaged library: {detail}"),
        }
    }
}

impl From<rusqlite::Error> for OpenError {
    fn from(err: rusqlite::Error) -> Self {
        Self::Damaged(err.to_string())
    }
}

/// Opens (or creates) a library file and brings its tables up to date.
pub fn open(path: &Path) -> Result<Connection, OpenError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| OpenError::Damaged(e.to_string()))?;
    }
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch("PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;")?;
    if !is_healthy(&conn) {
        return Err(OpenError::Damaged("integrity check failed".into()));
    }
    upgrade(&conn)?;
    Ok(conn)
}

/// Opens a library file only to read it (a backup being checked).
pub fn open_read_only(path: &Path) -> rusqlite::Result<Connection> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
}

/// SQLite's own full check of the file.
pub fn is_healthy(conn: &Connection) -> bool {
    conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .is_ok_and(|result| result == "ok")
}

fn upgrade(conn: &Connection) -> Result<(), OpenError> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > SCHEMA {
        return Err(OpenError::Newer(version));
    }
    if version < 1 {
        conn.execute_batch(&format!(
            "BEGIN; {SCHEMA_1} PRAGMA user_version = 1; COMMIT;"
        ))?;
    }
    Ok(())
}

/// A value of the `meta` table.
pub fn meta(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .optional()
}

/// Sets (or with `None` removes) a value of the `meta` table.
pub fn set_meta(conn: &Connection, key: &str, value: Option<&str>) -> rusqlite::Result<()> {
    match value {
        Some(value) => conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![key, value],
        ),
        None => conn.execute("DELETE FROM meta WHERE key = ?1", [key]),
    }
    .map(|_| ())
}

/// Windows paths ignore case: one track, one key.
pub fn path_key(path: &str) -> String {
    path.to_lowercase()
}

/// The library of the running app, shared by all commands.
pub struct Library {
    places: Places,
    /// `None` only while a backup is being restored, or if the library could not be opened
    conn: Mutex<Option<Connection>>,
    /// Why the library is missing, when it could not be opened
    failure: Option<String>,
    /// Name of the backup put back at start because the library was damaged
    recovered: Option<String>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Library {
    /// Opens the library at start: a damaged file is set aside and replaced by the newest
    /// healthy backup; the files of older versions are then imported once.
    pub fn start(places: Places) -> Self {
        let file = places.user.join(FILE);
        let mut recovered = None;
        let mut failure = None;
        let conn = match open(&file) {
            Ok(conn) => Some(conn),
            Err(OpenError::Newer(version)) => {
                failure = Some(OpenError::Newer(version).to_string());
                None
            }
            Err(OpenError::Damaged(detail)) => {
                log::error("library", &format!("damaged library: {detail}"));
                match backup::recover(&places, &file) {
                    Ok((conn, name)) => {
                        recovered = name;
                        Some(conn)
                    }
                    Err(err) => {
                        failure = Some(err.to_string());
                        None
                    }
                }
            }
        };
        if let Some(conn) = &conn
            && let Err(err) = legacy::import_old_files(conn, &places)
        {
            log::error("library", &format!("importing the old files failed: {err}"));
        }
        if let Some(err) = &failure {
            log::error("library", err);
        }
        Self {
            places,
            conn: Mutex::new(conn),
            failure,
            recovered,
        }
    }

    pub fn places(&self) -> &Places {
        &self.places
    }

    /// The library file.
    pub fn file(&self) -> PathBuf {
        self.places.user.join(FILE)
    }

    /// The backup put back at start, if the library was damaged.
    pub fn recovered(&self) -> Option<&str> {
        self.recovered.as_deref()
    }

    /// Runs `f` with the open library.
    pub fn with<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, LibraryError>,
    ) -> Result<T, LibraryError> {
        let guard = lock(&self.conn);
        let conn = guard
            .as_ref()
            .ok_or_else(|| LibraryError::Unavailable(self.failure.clone().unwrap_or_default()))?;
        f(conn)
    }

    /// Runs `f` with the library closed (its slot emptied), then opens it again: for restoring
    /// a backup over the file. `f` gets the connection to close.
    pub fn reopen_after(
        &self,
        f: impl FnOnce(Connection) -> Result<(), LibraryError>,
    ) -> Result<(), LibraryError> {
        let mut guard = lock(&self.conn);
        let conn = guard
            .take()
            .ok_or_else(|| LibraryError::Unavailable(self.failure.clone().unwrap_or_default()))?;
        let result = f(conn);
        *guard = Some(open(&self.file()).map_err(|e| LibraryError::Other(e.to_string()))?);
        result
    }
}

/// What can go wrong with the library.
#[derive(Debug)]
pub enum LibraryError {
    Db(rusqlite::Error),
    Io(std::io::Error),
    /// A project or value that cannot be read
    Invalid(String),
    /// The library could not be opened at start
    Unavailable(String),
    Other(String),
}

impl std::fmt::Display for LibraryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Db(err) => write!(f, "library error: {err}"),
            Self::Io(err) => write!(f, "library file error: {err}"),
            Self::Invalid(detail) => write!(f, "invalid data: {detail}"),
            Self::Unavailable(detail) => write!(f, "library unavailable: {detail}"),
            Self::Other(detail) => f.write_str(detail),
        }
    }
}

impl From<rusqlite::Error> for LibraryError {
    fn from(err: rusqlite::Error) -> Self {
        Self::Db(err)
    }
}

impl From<std::io::Error> for LibraryError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl From<serde_json::Error> for LibraryError {
    fn from(err: serde_json::Error) -> Self {
        Self::Invalid(err.to_string())
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// A fresh library in memory.
    pub fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        upgrade(&conn).unwrap();
        conn
    }

    #[test]
    fn creates_the_tables_once_and_keeps_the_version() {
        let dir = crate::project::tests::temp_dir("db-open");
        let file = dir.join(FILE);
        let conn = open(&file).unwrap();
        set_meta(&conn, "k", Some("v")).unwrap();
        drop(conn);
        let conn = open(&file).unwrap();
        assert_eq!(meta(&conn, "k").unwrap().as_deref(), Some("v"));
        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA);
    }

    #[test]
    fn refuses_a_newer_library_and_a_damaged_one() {
        let dir = crate::project::tests::temp_dir("db-newer");
        let file = dir.join(FILE);
        open(&file)
            .unwrap()
            .execute_batch("PRAGMA user_version = 99")
            .unwrap();
        assert!(matches!(open(&file), Err(OpenError::Newer(99))));

        let broken = dir.join("broken.db");
        std::fs::write(&broken, vec![7u8; 4096]).unwrap();
        assert!(matches!(open(&broken), Err(OpenError::Damaged(_))));
    }
}
