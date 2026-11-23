//! The lesson library: the course folders chosen by the user, read as course → module → lesson.
//!
//! A lesson is the media files of one folder that share a name (see `exercise::name_parts`:
//! «Slides.mp4», «Slides Second Angle.mp4», «Slides Backing.mp3») with the scores beside them
//! («Slides tab.gp», «Slides tab.pdf»). The folders are read in the background and their
//! listing kept in the library (`lesson_roots.idx`): a later reading only lists again the folders
//! whose modification time changed, and the Home shows the kept listing at once.
//!
//! What the user corrects (which file opens, which tab goes with it) is kept per lesson in
//! `lesson_choices`. Nothing is ever written in the course folders.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::db::{LibraryError, path_key};
use crate::exercise::{TakeKind, media_kind, name_parts, title_case};
use crate::project;

/// Score files Looplab draws, best first (the first found of the earliest kind is linked).
const SCORE_KINDS: &[&[&str]] = &[
    &["gp", "gp5", "gp4", "gp3", "gpx"],
    &["musicxml", "mxl", "xml"],
    &["capx"],
    &["pdf"],
];
/// Words at the end of a score's name that are not part of the lesson's name.
const SCORE_WORDS: &[&str] = &[
    "guitar pro",
    "sheet music",
    "tablatura",
    "tablature",
    "spartito",
    "notation",
    "score",
    "sheet",
    "tabs",
    "tab",
];
/// Folders deeper than this under a course folder are not read (a guard against folder loops
/// through links, far deeper than any course).
const MAX_DEPTH: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LessonFileKind {
    Video,
    Audio,
    Score,
    Pdf,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LessonFile {
    pub path: String,
    pub kind: LessonFileKind,
    /// What tells it apart from the lesson's other files: «Second Angle», «Backing», «Tab»…
    pub label: String,
    /// A take without the player
    pub backing: bool,
}

/// How far the lesson's tab is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TabState {
    /// No score beside it
    None,
    /// A score is beside it, linked at the first opening
    Found,
    /// Linked, not synced with the recording yet
    Linked,
    /// Linked and synced
    Synced,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    /// Folder + name: the key of the user's choices
    pub id: String,
    /// The course folder it was found in
    pub root: String,
    /// The folders between the course and the lesson («Module 02 Technique»), for headings
    pub group: String,
    pub name: String,
    pub folder: String,
    /// Videos first, then audio, then scores
    pub files: Vec<LessonFile>,
    /// What «Open» opens; `None` for a lesson of documents only (a study guide)
    pub main: Option<String>,
    /// The score linked at the opening; `None` = none
    pub score: Option<String>,
    /// The user chose what opens or which tab goes with it
    pub chosen: bool,
    pub tab: TabState,
    /// Last opening of any of its files (seconds since 1970)
    pub opened_at: Option<f64>,
    /// Seconds practised in all, from the diary
    pub practice: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LessonRoot {
    pub path: String,
    pub name: String,
    /// False when the folder is gone (a disconnected drive): its lessons are kept
    pub exists: bool,
    pub lessons: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LessonLibrary {
    pub roots: Vec<LessonRoot>,
    pub lessons: Vec<Lesson>,
}

/// What the user picked for one lesson.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LessonChoice {
    /// The file «Open» opens
    #[serde(default)]
    pub main: Option<String>,
    /// The tab linked at the opening
    #[serde(default)]
    pub score: Option<String>,
    /// No tab is linked by itself (the user removed it)
    #[serde(default)]
    pub no_score: bool,
}

/// One folder as last read.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Dir {
    mtime: f64,
    /// Names of the media and score files
    files: Vec<String>,
    /// Names of the sub-folders
    dirs: Vec<String>,
}

/// Every folder of a course, by full path.
pub type Index = BTreeMap<String, Dir>;

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64())
}

fn extension(name: &str) -> String {
    name.rsplit_once('.')
        .map(|(_, ext)| ext.to_lowercase())
        .unwrap_or_default()
}

/// 0 = Guitar Pro … 3 = PDF; `None` for other files.
fn score_rank(name: &str) -> Option<usize> {
    let ext = extension(name);
    SCORE_KINDS
        .iter()
        .position(|kind| kind.contains(&ext.as_str()))
}

fn is_wanted(name: &str) -> bool {
    media_kind(Path::new(name)).is_some() || score_rank(name).is_some()
}

fn mtime(path: &Path) -> f64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0.0, |d| d.as_secs_f64())
}

/// Lists one folder's media, scores and sub-folders.
fn read_dir(path: &Path) -> Dir {
    let mut dir = Dir {
        mtime: mtime(path),
        ..Dir::default()
    };
    let Ok(entries) = std::fs::read_dir(path) else {
        return dir;
    };
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => dir.dirs.push(name),
            Ok(kind) if kind.is_file() && is_wanted(&name) => dir.files.push(name),
            _ => {}
        }
    }
    dir.files.sort_by(|a, b| natural(a, b));
    dir.dirs.sort_by(|a, b| natural(a, b));
    dir
}

/// Reads a course folder again: folders unchanged since `old` keep their listing unread.
fn scan(root: &Path, old: &Index) -> Index {
    let mut index = Index::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((path, depth)) = stack.pop() {
        let key = path.to_string_lossy().into_owned();
        let time = mtime(&path);
        let dir = match old.get(&key) {
            Some(dir) if time > 0.0 && (dir.mtime - time).abs() < 1e-6 => dir.clone(),
            _ => read_dir(&path),
        };
        if depth < MAX_DEPTH {
            for sub in &dir.dirs {
                stack.push((path.join(sub), depth + 1));
            }
        }
        index.insert(key, dir);
    }
    index
}

/// Names compared with their numbers as numbers («Exercise 9» before «Exercise 10»).
fn natural(a: &str, b: &str) -> Ordering {
    fn chunks(s: &str) -> Vec<(bool, String)> {
        let mut out: Vec<(bool, String)> = Vec::new();
        for c in s.to_lowercase().chars() {
            let digit = c.is_ascii_digit();
            match out.last_mut() {
                Some((d, text)) if *d == digit => text.push(c),
                _ => out.push((digit, c.to_string())),
            }
        }
        out
    }
    let (ca, cb) = (chunks(a), chunks(b));
    for ((da, ta), (db, tb)) in ca.iter().zip(&cb) {
        let order = if *da && *db {
            let (na, nb) = (ta.trim_start_matches('0'), tb.trim_start_matches('0'));
            na.len().cmp(&nb.len()).then_with(|| na.cmp(nb))
        } else {
            ta.cmp(tb)
        };
        if order != Ordering::Equal {
            return order;
        }
    }
    ca.len().cmp(&cb.len())
}

/// «03 Exercise 04 Slides» → «Exercise 04 Slides»: the number that only sorts the folder.
fn without_number(name: &str) -> &str {
    let rest = name.trim_start_matches(|c: char| c.is_ascii_digit());
    if rest.len() == name.len() {
        return name;
    }
    let trimmed = rest.trim_start_matches([' ', '.', '-', '_']);
    if trimmed.is_empty() || trimmed.len() == rest.len() {
        name
    } else {
        trimmed
    }
}

/// «Exercise 04 Slides tab.pdf» → key «exercise 04 slides», label «Tab».
fn score_parts(file_name: &str) -> (String, String) {
    let stem = file_name.rsplit_once('.').map_or(file_name, |(s, _)| s);
    let mut words: Vec<String> = stem
        .to_lowercase()
        .split(|c: char| c.is_whitespace() || "-_()[].,".contains(c))
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect();
    let mut removed: Vec<String> = Vec::new();
    while let Some(phrase) = SCORE_WORDS.iter().find(|phrase| {
        let parts: Vec<&str> = phrase.split(' ').collect();
        words.len() > parts.len()
            && words[words.len() - parts.len()..]
                .iter()
                .zip(&parts)
                .all(|(a, b)| a == b)
    }) {
        let cut = words.len() - phrase.split(' ').count();
        removed.insert(0, words.split_off(cut).join(" "));
    }
    let label = title_case(&removed);
    (words.join(" "), label)
}

/// A media file's name without its extensions and its label: «Exercise 04 Slides».
fn shown_name(file_name: &str, label: &str) -> String {
    let mut stem = file_name;
    while let Some((head, _)) = stem.rsplit_once('.') {
        if media_kind(Path::new(stem)).is_some() || score_rank(stem).is_some() {
            stem = head;
        } else {
            break;
        }
    }
    let lower = stem.to_lowercase();
    let label = label.to_lowercase();
    let name = if !label.is_empty() && lower.ends_with(&label) {
        stem[..stem.len() - label.len()].trim_end_matches([' ', '-', '_', '('])
    } else {
        stem
    };
    without_number(name.trim()).to_string()
}

/// A lesson found in a folder, before the user's choices and the status are added.
struct Found {
    key: String,
    files: Vec<LessonFile>,
}

/// The lessons of one folder: media grouped by name, each score with the media of its name
/// (or with the only lesson of the folder); scores with no media make a lesson of documents.
fn folder_lessons(folder: &Path, names: &[String]) -> Vec<Found> {
    let mut found: Vec<Found> = Vec::new();
    for name in names {
        let Some(kind) = media_kind(Path::new(name)) else {
            continue;
        };
        let parts = name_parts(name);
        let file = LessonFile {
            path: folder.join(name).to_string_lossy().into_owned(),
            kind: match kind {
                TakeKind::Video => LessonFileKind::Video,
                TakeKind::Audio => LessonFileKind::Audio,
            },
            label: parts.label,
            backing: parts.backing && kind == TakeKind::Audio,
        };
        match found.iter_mut().find(|f| f.key == parts.key) {
            Some(lesson) => lesson.files.push(file),
            None => found.push(Found {
                key: parts.key,
                files: vec![file],
            }),
        }
    }
    let media_lessons = found.len();
    for name in names {
        let Some(rank) = score_rank(name) else {
            continue;
        };
        let (key, label) = score_parts(name);
        let file = LessonFile {
            path: folder.join(name).to_string_lossy().into_owned(),
            kind: if rank == SCORE_KINDS.len() - 1 {
                LessonFileKind::Pdf
            } else {
                LessonFileKind::Score
            },
            label,
            backing: false,
        };
        let target = found
            .iter()
            .position(|f| f.key == key)
            .or((media_lessons == 1).then_some(0));
        match target {
            Some(i) => found[i].files.push(file),
            None => found.push(Found {
                key,
                files: vec![file],
            }),
        }
    }
    for lesson in &mut found {
        lesson.files.sort_by_key(|f| match f.kind {
            LessonFileKind::Video => 0,
            LessonFileKind::Audio => 1,
            LessonFileKind::Score => 2,
            LessonFileKind::Pdf => 3,
        });
    }
    found
}

/// Letters and digits only, lower case: «01 Lesson 01 Warm-Up» and «lesson 01 warm up» agree.
fn squashed(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// True when a folder holding one lesson is that lesson (course folders like «02 Exercise 03
/// Basic Shapes» holding «Exercise 03 Basic Shapes.mp4»): the lesson takes the folder's name and
/// the folder is no heading. Any other folder («Live» holding «Gig 2019.mkv») stays a heading and
/// the lesson keeps its own name.
fn folder_is_lesson(folder: &Path, root: &Path, found: &[Found]) -> bool {
    let [lesson] = found else {
        return false;
    };
    if folder == root {
        return false;
    }
    let folder_name = folder
        .file_name()
        .map(|n| squashed(without_number(&n.to_string_lossy())))
        .unwrap_or_default();
    let own = squashed(&lesson.key);
    !folder_name.is_empty()
        && !own.is_empty()
        && (folder_name.contains(&own) || own.contains(&folder_name))
}

/// What «Open» opens by default: the main video, else a video, else the audio with the player.
fn default_main(files: &[LessonFile]) -> Option<String> {
    let media = |f: &&LessonFile| matches!(f.kind, LessonFileKind::Video | LessonFileKind::Audio);
    files
        .iter()
        .filter(media)
        .min_by_key(|f| {
            (
                f.backing,
                f.kind != LessonFileKind::Video,
                !f.label.is_empty(),
            )
        })
        .map(|f| f.path.clone())
}

/// The score linked by default: Guitar Pro first, PDF last.
fn default_score(files: &[LessonFile]) -> Option<String> {
    files
        .iter()
        .filter(|f| matches!(f.kind, LessonFileKind::Score | LessonFileKind::Pdf))
        .min_by_key(|f| {
            let name = Path::new(&f.path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            score_rank(&name).unwrap_or(usize::MAX)
        })
        .map(|f| f.path.clone())
}

fn lesson_id(folder: &Path, key: &str) -> String {
    format!("{}|{key}", path_key(&folder.to_string_lossy()))
}

fn choice(conn: &Connection, id: &str) -> Result<LessonChoice, LibraryError> {
    let data: Option<String> = conn
        .query_row("SELECT data FROM lesson_choices WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(match data {
        Some(json) => serde_json::from_str(&json)?,
        None => LessonChoice::default(),
    })
}

/// Remembers what the user picked for a lesson (an empty choice is forgotten).
pub fn set_choice(conn: &Connection, id: &str, choice: &LessonChoice) -> Result<(), LibraryError> {
    if *choice == LessonChoice::default() {
        conn.execute("DELETE FROM lesson_choices WHERE id = ?1", [id])?;
    } else {
        conn.execute(
            "INSERT INTO lesson_choices (id, data) VALUES (?1, ?2)
             ON CONFLICT (id) DO UPDATE SET data = excluded.data",
            params![id, serde_json::to_string(choice)?],
        )?;
    }
    Ok(())
}

fn is_media(file: &LessonFile) -> bool {
    matches!(file.kind, LessonFileKind::Video | LessonFileKind::Audio)
}

/// The lesson with the user's choices, its tab state, last opening and practice time.
fn complete(
    conn: &Connection,
    root: &Path,
    folder: &Path,
    single: bool,
    found: Found,
) -> Result<Lesson, LibraryError> {
    let id = lesson_id(folder, &found.key);
    let picked = choice(conn, &id)?;
    let has = |path: &Option<String>| {
        path.as_ref()
            .filter(|p| found.files.iter().any(|f| path_key(&f.path) == path_key(p)))
            .cloned()
    };
    let main = has(&picked.main).or_else(|| default_main(&found.files));
    // A lesson of documents only has no recording to link a tab to
    let score = if picked.no_score || main.is_none() {
        None
    } else {
        has(&picked.score).or_else(|| default_score(&found.files))
    };
    let chosen = picked != LessonChoice::default();

    // Headings: the folders between the course and the lesson's own folder
    let rel: Vec<String> = folder
        .strip_prefix(root)
        .map(|r| {
            r.components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    let heading_parts = if single && !rel.is_empty() {
        &rel[..rel.len() - 1]
    } else {
        &rel[..]
    };
    let group = heading_parts
        .iter()
        .map(|p| without_number(p))
        .collect::<Vec<_>>()
        .join(" › ");
    let name = if single && !rel.is_empty() {
        without_number(rel.last().map_or("", String::as_str)).to_string()
    } else {
        let first = found
            .files
            .iter()
            .find(|f| main.as_ref().is_some_and(|m| *m == f.path))
            .or_else(|| found.files.first());
        first.map_or_else(String::new, |f| {
            let file_name = Path::new(&f.path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            shown_name(&file_name, &f.label)
        })
    };

    let mut tab = if score.is_some() {
        TabState::Found
    } else {
        TabState::None
    };
    let mut opened_at: Option<f64> = None;
    let mut practice = 0.0;
    for file in found.files.iter().filter(|f| is_media(f)) {
        if let Some(project) = project::find(conn, &file.path)?
            && let Some(linked) = &project.score
        {
            let state = if linked.sync.is_empty() {
                TabState::Linked
            } else {
                TabState::Synced
            };
            if state == TabState::Synced || tab != TabState::Synced {
                tab = state;
            }
        }
        let key = path_key(&file.path);
        let opened: Option<f64> = conn
            .query_row(
                "SELECT opened_at FROM recent WHERE path_key = ?1",
                [&key],
                |r| r.get(0),
            )
            .optional()?
            .flatten();
        if let Some(time) = opened {
            opened_at = Some(opened_at.map_or(time, |t: f64| t.max(time)));
        }
        let seconds: Option<f64> = conn.query_row(
            "SELECT SUM(seconds) FROM diary WHERE path_key = ?1",
            [&key],
            |r| r.get(0),
        )?;
        practice += seconds.unwrap_or(0.0);
    }

    Ok(Lesson {
        id,
        root: root.to_string_lossy().into_owned(),
        group,
        name,
        folder: folder.to_string_lossy().into_owned(),
        files: found.files,
        main,
        score,
        chosen,
        tab,
        opened_at,
        practice,
    })
}

/// The lessons of a course from its listing, in folder order.
fn lessons_of(conn: &Connection, root: &Path, index: &Index) -> Result<Vec<Lesson>, LibraryError> {
    let mut folders: Vec<(&String, &Dir)> = index.iter().collect();
    folders.sort_by(|a, b| natural(a.0, b.0));
    let mut out = Vec::new();
    for (folder, dir) in folders {
        let folder = Path::new(folder);
        let found = folder_lessons(folder, &dir.files);
        let single = folder_is_lesson(folder, root, &found);
        let mut lessons = Vec::new();
        for lesson in found {
            lessons.push(complete(conn, root, folder, single, lesson)?);
        }
        lessons.sort_by(|a, b| natural(&a.name, &b.name));
        out.extend(lessons);
    }
    Ok(out)
}

fn stored_roots(conn: &Connection) -> Result<Vec<(String, Index)>, LibraryError> {
    let mut query = conn.prepare("SELECT path, idx FROM lesson_roots ORDER BY added_at")?;
    let rows: Vec<(String, String)> = query
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(rows
        .into_iter()
        .map(|(path, idx)| (path, serde_json::from_str(&idx).unwrap_or_default()))
        .collect())
}

/// The library as last read: immediate, no folder is touched.
pub fn library(conn: &Connection) -> Result<LessonLibrary, LibraryError> {
    let mut roots = Vec::new();
    let mut lessons: Vec<Lesson> = Vec::new();
    for (path, index) in stored_roots(conn)? {
        let root = PathBuf::from(&path);
        let found = lessons_of(conn, &root, &index)?;
        let before = lessons.len();
        // A course inside another one: its lessons are shown once
        for lesson in found {
            if !lessons.iter().any(|l| l.id == lesson.id) {
                lessons.push(lesson);
            }
        }
        roots.push(LessonRoot {
            name: root
                .file_name()
                .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned()),
            exists: root.is_dir(),
            lessons: u32::try_from(lessons.len() - before).unwrap_or(u32::MAX),
            path,
        });
    }
    Ok(LessonLibrary { roots, lessons })
}

/// The course folders and their listings, to read again with `rescan` (outside the lock).
pub fn listings(conn: &Connection) -> Result<Vec<(String, Index)>, LibraryError> {
    stored_roots(conn)
}

/// Reads the course folders again (slow: call it in the background). A folder that is gone
/// keeps its old listing, so a disconnected drive does not empty the Home.
pub fn rescan(listings: &[(String, Index)]) -> Vec<(String, Index)> {
    listings
        .iter()
        .map(|(path, old)| {
            let root = Path::new(path);
            let index = if root.is_dir() {
                scan(root, old)
            } else {
                old.clone()
            };
            (path.clone(), index)
        })
        .collect()
}

/// Keeps the new listings (of folders still in the library).
pub fn store_listings(conn: &Connection, listings: &[(String, Index)]) -> Result<(), LibraryError> {
    for (path, index) in listings {
        conn.execute(
            "UPDATE lesson_roots SET idx = ?2, scanned_at = ?3 WHERE path_key = ?1",
            params![path_key(path), serde_json::to_string(index)?, now()],
        )?;
    }
    Ok(())
}

/// Adds a course folder (read at the next `rescan`).
pub fn add_root(conn: &Connection, path: &str) -> Result<(), LibraryError> {
    conn.execute(
        "INSERT INTO lesson_roots (path_key, path, added_at, idx) VALUES (?1, ?2, ?3, '{}')
         ON CONFLICT (path_key) DO NOTHING",
        params![path_key(path), path, now()],
    )?;
    Ok(())
}

/// Takes a course folder off the Home (its files are not touched).
pub fn remove_root(conn: &Connection, path: &str) -> Result<(), LibraryError> {
    conn.execute(
        "DELETE FROM lesson_roots WHERE path_key = ?1",
        [path_key(path)],
    )?;
    Ok(())
}

/// The lesson `track` belongs to, read from its own folder (also for files outside the
/// course folders: a song dropped on the window finds its tab too).
pub fn lesson_of(conn: &Connection, track: &str) -> Result<Option<Lesson>, LibraryError> {
    let path = Path::new(track);
    let Some(folder) = path.parent() else {
        return Ok(None);
    };
    let dir = read_dir(folder);
    let found = folder_lessons(folder, &dir.files);
    let root = folder.parent().unwrap_or(folder);
    let single = folder_is_lesson(folder, root, &found);
    for lesson in found {
        if lesson
            .files
            .iter()
            .any(|f| path_key(&f.path) == path_key(track))
        {
            return complete(conn, root, folder, single, lesson).map(Some);
        }
    }
    Ok(None)
}

/// The score to link to `track` when its project has none: the one beside it, unless the
/// user removed it from that lesson.
pub fn score_beside(conn: &Connection, track: &str) -> Result<Option<String>, LibraryError> {
    Ok(lesson_of(conn, track)?.and_then(|lesson| lesson.score))
}

/// The user removed the tab of `track`'s lesson: it is not linked again by itself.
pub fn forget_score(conn: &Connection, track: &str) -> Result<(), LibraryError> {
    let Some(lesson) = lesson_of(conn, track)? else {
        return Ok(());
    };
    let mut picked = choice(conn, &lesson.id)?;
    picked.score = None;
    picked.no_score = true;
    set_choice(conn, &lesson.id, &picked)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::memory;
    use std::fs;

    fn course(name: &str) -> PathBuf {
        let root = crate::project::tests::temp_dir(name);
        let files = [
            "01 Study Guide/Course StudyGuide.pdf",
            "02 Module 01 Warm-Up/01 Lesson 01 Warm-Up/Lesson 01 Warm-up.mp4",
            "02 Module 01 Warm-Up/02 Exercise 01 Classic/Exercise 01 Classic.mp4",
            "02 Module 01 Warm-Up/02 Exercise 01 Classic/Exercise 01 Classic Second Angle.mp4",
            "02 Module 01 Warm-Up/02 Exercise 01 Classic/Exercise 01 Classic.mp3",
            "02 Module 01 Warm-Up/02 Exercise 01 Classic/Exercise 01 Classic tab.gp",
            "02 Module 01 Warm-Up/02 Exercise 01 Classic/Exercise 01 Classic tab.pdf",
            "02 Module 01 Warm-Up/10 Exercise 10 Late/Exercise 10 Late.mp4",
            "02 Module 01 Warm-Up/09 Exercise 09 Early/Exercise 09 Early.mp4",
            "03 Songs/Melody Solo.mp4",
            "03 Songs/Melody Solo Backing.mp3",
            "03 Songs/Melody Solo tab.gp",
            "03 Songs/Other Song.mp3",
            "03 Songs/notes.txt",
        ];
        for file in files {
            let path = root.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, file.as_bytes()).unwrap();
        }
        root
    }

    fn read(conn: &Connection, root: &Path) -> LessonLibrary {
        add_root(conn, &root.to_string_lossy()).unwrap();
        let listings = rescan(&listings(conn).unwrap());
        store_listings(conn, &listings).unwrap();
        library(conn).unwrap()
    }

    fn named<'a>(lib: &'a LessonLibrary, name: &str) -> &'a Lesson {
        lib.lessons.iter().find(|l| l.name == name).unwrap()
    }

    #[test]
    fn a_course_folder_becomes_modules_and_lessons() {
        let conn = memory();
        let root = course("lessons-course");
        let lib = read(&conn, &root);
        let names: Vec<&str> = lib.lessons.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "Study Guide",
                "Lesson 01 Warm-Up",
                "Exercise 01 Classic",
                "Exercise 09 Early",
                "Exercise 10 Late",
                "Melody Solo",
                "Other Song"
            ]
        );
        assert_eq!(lib.roots[0].lessons, 7);
        let classic = named(&lib, "Exercise 01 Classic");
        assert_eq!(classic.group, "Module 01 Warm-Up");
        assert_eq!(classic.files.len(), 5);
        assert!(
            classic
                .main
                .as_ref()
                .unwrap()
                .ends_with("Exercise 01 Classic.mp4")
        );
        assert!(classic.score.as_ref().unwrap().ends_with("tab.gp"));
        assert_eq!(classic.tab, TabState::Found);
        // Several lessons in one folder: named from their files, headed by the folder
        let melody = named(&lib, "Melody Solo");
        assert_eq!(melody.group, "Songs");
        assert!(melody.files.iter().any(|f| f.backing));
        assert!(
            melody
                .score
                .as_ref()
                .unwrap()
                .ends_with("Melody Solo tab.gp")
        );
        assert!(named(&lib, "Other Song").score.is_none());
        let guide = named(&lib, "Study Guide");
        assert!(guide.main.is_none());
        assert_eq!(guide.tab, TabState::None);
        assert_eq!(guide.files[0].kind, LessonFileKind::Pdf);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn changes_in_the_folders_are_found_and_choices_kept() {
        let conn = memory();
        let root = course("lessons-changes");
        read(&conn, &root);
        let folder = root.join("03 Songs");
        fs::write(folder.join("New Lick.mp4"), b"new").unwrap();
        fs::remove_file(folder.join("Other Song.mp3")).unwrap();
        let lib = read(&conn, &root);
        assert!(lib.lessons.iter().any(|l| l.name == "New Lick"));
        assert!(!lib.lessons.iter().any(|l| l.name == "Other Song"));

        // The user opens the mp3 and takes the PDF instead of the Guitar Pro file
        let classic = named(&lib, "Exercise 01 Classic").clone();
        let mp3 = classic
            .files
            .iter()
            .find(|f| f.kind == LessonFileKind::Audio)
            .unwrap();
        let pdf = classic
            .files
            .iter()
            .find(|f| f.kind == LessonFileKind::Pdf)
            .unwrap();
        set_choice(
            &conn,
            &classic.id,
            &LessonChoice {
                main: Some(mp3.path.clone()),
                score: Some(pdf.path.clone()),
                no_score: false,
            },
        )
        .unwrap();
        let again = library(&conn).unwrap();
        let classic = named(&again, "Exercise 01 Classic");
        assert_eq!(classic.main.as_deref(), Some(mp3.path.as_str()));
        assert_eq!(classic.score.as_deref(), Some(pdf.path.as_str()));
        assert!(classic.chosen);
        assert_eq!(
            score_beside(&conn, &mp3.path).unwrap(),
            Some(pdf.path.clone())
        );

        // Removed by the user: not linked again by itself
        forget_score(&conn, &mp3.path).unwrap();
        assert_eq!(score_beside(&conn, &mp3.path).unwrap(), None);

        remove_root(&conn, &root.to_string_lossy()).unwrap();
        assert!(library(&conn).unwrap().lessons.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn any_folder_of_media_is_a_course() {
        // No modules, no numbers, no tabs: plain videos and songs, loose and in sub-folders
        let conn = memory();
        let root = crate::project::tests::temp_dir("lessons-any-folder");
        for file in [
            "holiday clip.m4v",
            "voice memo.aif",
            "old tape.wave",
            "notes.txt",
            "Live/Gig 2019.mkv",
            "Live/Encore.mka",
            "Live/Deep/Deeper/Still There.oga",
        ] {
            let path = root.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, b"x").unwrap();
        }
        let lib = read(&conn, &root);
        let mut names: Vec<&str> = lib.lessons.iter().map(|l| l.name.as_str()).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            [
                "Encore",
                "Gig 2019",
                "Still There",
                "holiday clip",
                "old tape",
                "voice memo"
            ]
        );
        assert!(lib.lessons.iter().all(|l| l.main.is_some()));
        // A folder holding one file of another name is a heading, not the lesson's name
        let still = lib
            .lessons
            .iter()
            .find(|l| l.name == "Still There")
            .unwrap();
        assert_eq!(still.group, "Live › Deep › Deeper");
    }

    #[test]
    fn a_gone_course_keeps_its_lessons() {
        let conn = memory();
        let root = course("lessons-gone");
        let before = read(&conn, &root).lessons.len();
        fs::remove_dir_all(&root).unwrap();
        let after = read(&conn, &root);
        assert_eq!(after.lessons.len(), before);
        assert!(!after.roots[0].exists);
    }

    #[test]
    fn names_and_order() {
        assert_eq!(natural("Exercise 9", "Exercise 10"), Ordering::Less);
        assert_eq!(natural("02 b", "10 a"), Ordering::Less);
        assert_eq!(
            without_number("03 Exercise 04 Slides"),
            "Exercise 04 Slides"
        );
        assert_eq!(without_number("2026"), "2026");
        assert_eq!(without_number("Module 2"), "Module 2");
        assert_eq!(
            score_parts("Exercise 04 Slides tab.pdf"),
            ("exercise 04 slides".to_string(), "Tab".to_string())
        );
        assert_eq!(
            shown_name("Exercise 02 Twist Second Angle.mp4.mp4", "Second Angle"),
            "Exercise 02 Twist"
        );
    }
}
