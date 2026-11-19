//! Score files (Guitar Pro, MusicXML, PDF) linked to tracks.
//!
//! A linked file is copied once into the `spartiti` folder beside the library and named by its
//! content (`<size>-<hash>.<ext>`): the same file linked to two songs is stored once, the user's
//! original is never touched, and every backup holds the folder. Which file belongs to which
//! song lives in the song's project in `libreria.db`. Files no project uses any more are removed
//! at start, so nothing is left behind.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use rusqlite::Connection;
use serde::Serialize;

use crate::hash::fnv1a;

/// Larger files are refused: a score is a few KB, a scanned PDF a few tens of MB.
pub const MAX_BYTES: u64 = 200 * 1024 * 1024;
/// Ending of a copy still being written; a leftover one is removed at start.
const PARTIAL: &str = ".parziale";
/// A file copied in this recently is kept even if no project names it yet (its project is
/// saved a moment after the copy).
const GRACE: Duration = Duration::from_secs(60 * 60);

/// What kind of score a file is, from its extension.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScoreKind {
    /// Guitar Pro 3-8, MusicXML, Capella: notes Looplab can draw and follow
    Notation,
    /// A picture of the music (phase 23)
    Pdf,
}

/// Extensions accepted, lower case, and their kind.
const EXTENSIONS: [(&str, ScoreKind); 10] = [
    ("gp3", ScoreKind::Notation),
    ("gp4", ScoreKind::Notation),
    ("gp5", ScoreKind::Notation),
    ("gpx", ScoreKind::Notation),
    ("gp", ScoreKind::Notation),
    ("musicxml", ScoreKind::Notation),
    ("mxl", ScoreKind::Notation),
    ("xml", ScoreKind::Notation),
    ("capx", ScoreKind::Notation),
    ("pdf", ScoreKind::Pdf),
];

/// The kind of a score file, `None` if Looplab does not read it.
pub fn kind_of(path: &Path) -> Option<ScoreKind> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    EXTENSIONS
        .iter()
        .find(|(e, _)| *e == ext)
        .map(|(_, kind)| *kind)
}

/// A score file in the library.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScoreFile {
    /// File name in the `spartiti` folder: what projects store
    pub file: String,
    /// Name of the user's original, to show
    pub name: String,
    pub kind: ScoreKind,
    pub bytes: f64,
}

/// Why a score could not be linked.
#[derive(Debug)]
pub enum ImportError {
    Unsupported,
    TooLarge,
    Empty,
    Io(std::io::Error),
}

impl From<std::io::Error> for ImportError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// The name a file's content gets in the folder.
fn content_name(bytes: &[u8], ext: &str) -> String {
    format!("{:x}-{:016x}.{ext}", bytes.len(), fnv1a(bytes))
}

/// True for a name `content_name` could have made: nothing that leaves the folder.
pub fn is_content_name(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    let Some((size, hash)) = stem.split_once('-') else {
        return false;
    };
    !size.is_empty()
        && size.chars().all(|c| c.is_ascii_hexdigit())
        && hash.len() == 16
        && hash.chars().all(|c| c.is_ascii_hexdigit())
        && EXTENSIONS.iter().any(|(e, _)| *e == ext)
}

/// Copies `source` into `dir` (once: an identical file already there is reused).
pub fn import(dir: &Path, source: &Path) -> Result<ScoreFile, ImportError> {
    let kind = kind_of(source).ok_or(ImportError::Unsupported)?;
    let size = fs::metadata(source)?.len();
    if size > MAX_BYTES {
        return Err(ImportError::TooLarge);
    }
    if size == 0 {
        return Err(ImportError::Empty);
    }
    let mut bytes = Vec::with_capacity(size as usize);
    File::open(source)?.read_to_end(&mut bytes)?;
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let file = content_name(&bytes, &ext);
    fs::create_dir_all(dir)?;
    let target = dir.join(&file);
    if target.is_file() {
        // Already there: mark it as just used, so the start-up clean-up keeps it
        File::options()
            .write(true)
            .open(&target)?
            .set_modified(SystemTime::now())?;
    } else {
        // Written aside, then renamed: a crash never leaves half a score under a real name
        let partial = dir.join(format!("{file}{PARTIAL}"));
        let mut out = File::create(&partial)?;
        out.write_all(&bytes)?;
        out.sync_all()?;
        drop(out);
        fs::rename(&partial, &target)?;
    }
    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| file.clone());
    Ok(ScoreFile {
        file,
        name,
        kind,
        bytes: size as f64,
    })
}

/// The path of a library score, refusing names that would leave the folder.
pub fn path_of(dir: &Path, file: &str) -> Option<PathBuf> {
    is_content_name(file).then(|| dir.join(file))
}

/// The score files the saved projects name.
fn used(conn: &Connection) -> rusqlite::Result<HashSet<String>> {
    let mut statement = conn.prepare(
        "SELECT json_extract(data, '$.score.file') FROM projects
         WHERE json_extract(data, '$.score.file') IS NOT NULL",
    )?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

/// Removes the files no project uses (older than an hour) and copies left half written.
/// Returns how many were removed. Anything that is not a score name is left alone.
pub fn sweep(conn: &Connection, dir: &Path) -> rusqlite::Result<usize> {
    let used = used(conn)?;
    let now = SystemTime::now();
    let mut removed = 0;
    for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .is_ok_and(|modified| now.duration_since(modified).unwrap_or_default() > GRACE);
        let leftover = name.strip_suffix(PARTIAL).is_some_and(is_content_name);
        let unused = is_content_name(&name) && !used.contains(&name);
        if old && (leftover || unused) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::memory;
    use crate::project::tests::temp_dir;

    fn age(path: &Path) {
        let past = SystemTime::now() - GRACE - Duration::from_secs(60);
        File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(past)
            .unwrap();
    }

    #[test]
    fn knows_the_score_formats() {
        assert_eq!(kind_of(Path::new("a/Song.GP5")), Some(ScoreKind::Notation));
        assert_eq!(kind_of(Path::new("tab.pdf")), Some(ScoreKind::Pdf));
        assert_eq!(kind_of(Path::new("song.mp3")), None);
        assert_eq!(kind_of(Path::new("noext")), None);
    }

    #[test]
    fn content_names_cannot_leave_the_folder() {
        assert!(is_content_name("1f-0123456789abcdef.gp"));
        assert!(!is_content_name("../1f-0123456789abcdef.gp"));
        assert!(!is_content_name("1f-0123456789abcdef.exe"));
        assert!(!is_content_name("1f-0123.gp"));
        assert!(!is_content_name("notes.gp"));
        assert!(path_of(Path::new("d"), "..\\x.gp").is_none());
    }

    #[test]
    fn the_same_file_is_stored_once_and_the_original_kept() {
        let root = temp_dir("scores-import");
        let dir = root.join("spartiti");
        let a = root.join("Song.gp5");
        let b = root.join("copy of song.GP5");
        fs::write(&a, b"guitar pro bytes").unwrap();
        fs::write(&b, b"guitar pro bytes").unwrap();
        let first = import(&dir, &a).unwrap();
        let second = import(&dir, &b).unwrap();
        assert_eq!(first.file, second.file);
        assert_eq!(first.name, "Song.gp5");
        assert_eq!(second.name, "copy of song.GP5");
        assert!(first.file.ends_with(".gp5"));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        assert!(a.is_file() && b.is_file());
        assert_eq!(
            fs::read(dir.join(&first.file)).unwrap(),
            b"guitar pro bytes"
        );
    }

    #[test]
    fn refuses_what_it_cannot_read() {
        let root = temp_dir("scores-refuse");
        let empty = root.join("empty.gp");
        fs::write(&empty, b"").unwrap();
        let audio = root.join("song.mp3");
        fs::write(&audio, b"ID3").unwrap();
        let dir = root.join("spartiti");
        assert!(matches!(import(&dir, &empty), Err(ImportError::Empty)));
        assert!(matches!(
            import(&dir, &audio),
            Err(ImportError::Unsupported)
        ));
        assert!(matches!(
            import(&dir, &root.join("gone.gp")),
            Err(ImportError::Io(_))
        ));
    }

    #[test]
    fn sweep_removes_only_old_unused_scores() {
        let root = temp_dir("scores-sweep");
        let dir = root.join("spartiti");
        let conn = memory();
        let src = |name: &str, body: &[u8]| {
            let p = root.join(name);
            fs::write(&p, body).unwrap();
            p
        };
        let used = import(&dir, &src("used.gp", b"used")).unwrap();
        let unused = import(&dir, &src("unused.gp", b"unused")).unwrap();
        let fresh = import(&dir, &src("fresh.gp", b"fresh")).unwrap();
        let partial = dir.join(format!("{}{PARTIAL}", content_name(b"half", "gp")));
        fs::write(&partial, b"ha").unwrap();
        let stranger = dir.join("leggimi.txt");
        fs::write(&stranger, b"mine").unwrap();
        for file in [&used.file, &unused.file] {
            age(&dir.join(file));
        }
        age(&partial);
        age(&stranger);
        conn.execute(
            "INSERT INTO projects (path_key, path, data, updated_at) VALUES ('k', 'p', ?1, 0)",
            [format!(r#"{{"score":{{"file":"{}"}}}}"#, used.file)],
        )
        .unwrap();
        assert_eq!(sweep(&conn, &dir).unwrap(), 2);
        assert!(dir.join(&used.file).is_file());
        assert!(dir.join(&fresh.file).is_file());
        assert!(!dir.join(&unused.file).exists());
        assert!(!partial.exists());
        assert!(stranger.is_file());
    }
}
