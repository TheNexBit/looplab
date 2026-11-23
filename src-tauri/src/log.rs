//! Error log: one line per problem in `<data>/logs/looplab.log`, so a bug report can include it.
//!
//! Errors returned by commands, crashes (panics) and errors of the UI all end up here.
//! The file never grows past `MAX_BYTES`: the older half is kept as `looplab.old.log`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::state::lock;

const FILE_NAME: &str = "looplab.log";
const OLD_FILE_NAME: &str = "looplab.old.log";
const MAX_BYTES: u64 = 1_000_000;

static PATH: OnceLock<PathBuf> = OnceLock::new();
/// Lines from several threads must not interleave
static WRITING: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy)]
pub enum Level {
    Info,
    Error,
}

/// The log folder inside the data folder.
pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("logs")
}

/// The current log file, once `init` ran.
pub fn file() -> Option<&'static Path> {
    PATH.get().map(PathBuf::as_path)
}

/// Starts logging into `data_dir` and records crashes. Called once at start-up.
pub fn init(data_dir: &Path, version: &str) {
    let dir = dir(data_dir);
    if fs::create_dir_all(&dir).is_err() || PATH.set(dir.join(FILE_NAME)).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info
            .location()
            .map(|l| format!(" ({}:{})", l.file(), l.line()))
            .unwrap_or_default();
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".to_owned());
        write(Level::Error, "panic", &format!("{message}{place}"));
        previous(info);
    }));
    write(Level::Info, "app", &format!("Looplab {version} started"));
}

/// Appends one line. Never fails: a log that cannot be written is simply skipped.
pub fn write(level: Level, source: &str, message: &str) {
    let Some(path) = PATH.get() else {
        return;
    };
    let _guard = lock(&WRITING);
    if fs::metadata(path).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = fs::rename(path, path.with_file_name(OLD_FILE_NAME));
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let level = match level {
        Level::Info => "INFO ",
        Level::Error => "ERROR",
    };
    // One line per entry, whatever the message contains
    let message = message.replace(['\r', '\n'], " ");
    let _ = writeln!(
        file,
        "{} {level} [{source}] {message}",
        timestamp(SystemTime::now())
    );
}

pub fn error(source: &str, message: &str) {
    write(Level::Error, source, message);
}

/// "2026-11-06 14:03:12 UTC": no time-zone database is needed, and it sorts as text.
fn timestamp(time: SystemTime) -> String {
    let seconds = time.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let (days, rest) = (seconds / 86_400, seconds % 86_400);
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// Days since 1970-01-01 → (year, month, day), Howard Hinnant's algorithm.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn formats_dates_in_utc() {
        assert_eq!(timestamp(UNIX_EPOCH), "1970-01-01 00:00:00 UTC");
        let date = UNIX_EPOCH + Duration::from_secs(1_793_973_792);
        assert_eq!(timestamp(date), "2026-11-06 14:03:12 UTC");
        // Leap day
        let leap = UNIX_EPOCH + Duration::from_secs(1_709_164_800);
        assert_eq!(timestamp(leap), "2024-02-29 00:00:00 UTC");
    }
}
