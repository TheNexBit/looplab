//! Exercises: the files of one take kept together — the lesson's video, its other camera angles,
//! its mp3 and its backing track. They are found by name in the track's folder («Lesson 01.mp4»,
//! «Lesson 01 Second Angle.mp4», «Lesson 01 Backing.mp3»), lined up from their sound
//! (`audio_engine::offset`), and kept in the library: nothing is written beside the media.
//!
//! Every file has a `shift` on the exercise's own clock: what is heard at time `t` of the
//! exercise is at `t + shift` in that file. The first file has shift 0. The parts of a project
//! that hold for the whole take (score sync, markers, loops, tempo) are shared between the files,
//! moved by the difference of their shifts.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::db::{LibraryError, path_key};
use crate::project::{self, Project, fingerprint};

const AUDIO: &[&str] = &["mp3", "wav", "flac", "m4a", "aac", "ogg", "aiff"];
const VIDEO: &[&str] = &["mp4", "mov", "mkv", "webm"];

/// Words at the end of a name that tell one file of the take from another, longest first.
/// The backing ones mark a take without the player.
const ANGLE_WORDS: &[&str] = &[
    "second angle",
    "third angle",
    "first angle",
    "main angle",
    "other angle",
    "close up",
    "closeup",
    "close",
    "wide",
    "right hand",
    "left hand",
    "mano destra",
    "mano sinistra",
    "overhead",
    "front",
    "side",
    "top",
    "pov",
    "angle",
    "angolo",
    "camera",
    "cam",
];
const BACKING_WORDS: &[&str] = &[
    "backing track",
    "backing",
    "jam track",
    "play along",
    "playalong",
    "no guitar",
    "senza chitarra",
    "minus one",
    "base",
];
const OTHER_WORDS: &[&str] = &[
    "with guitar",
    "con chitarra",
    "full mix",
    "audio",
    "video",
    "full",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TakeKind {
    Video,
    Audio,
}

/// How a file's shift was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LineUp {
    /// Not compared yet
    Pending,
    /// From its sound
    Sound,
    /// Set by hand
    Hand,
    /// It has no sound to compare: line it up by hand
    NoSound,
    /// Its sound is another take (another version of the lesson): kept apart
    Mismatch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseFile {
    pub path: String,
    /// Shown name: «Second Angle», «Backing»… (editable; empty = the main file)
    pub name: String,
    pub kind: TakeKind,
    /// A take without the player (heard with «Solo base»)
    pub backing: bool,
    /// Seconds on the exercise's clock (see the module notes); 0 until lined up
    pub shift: f64,
    pub line_up: LineUp,
}

impl ExerciseFile {
    /// The shift can be used to move times to or from this file.
    pub fn lined_up(&self) -> bool {
        matches!(self.line_up, LineUp::Sound | LineUp::Hand)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    /// Row of the `exercises` table
    pub id: i32,
    pub files: Vec<ExerciseFile>,
    /// The camera angle chosen last (a path), shown again at the next opening
    #[serde(default)]
    pub angle: Option<String>,
}

/// A name split into what all files of the take share and what tells this one apart.
#[derive(Debug, PartialEq)]
struct NameParts {
    key: String,
    label: String,
    backing: bool,
}

fn media_kind(path: &Path) -> Option<TakeKind> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if VIDEO.contains(&ext.as_str()) {
        Some(TakeKind::Video)
    } else if AUDIO.contains(&ext.as_str()) {
        Some(TakeKind::Audio)
    } else {
        None
    }
}

/// «Exercise 02 Twist Second Angle.mp4.mp4» → key «exercise 02 twist», label «Second Angle».
fn name_parts(file_name: &str) -> NameParts {
    // Extensions, even doubled ones
    let mut stem = file_name;
    while let Some((head, ext)) = stem.rsplit_once('.') {
        let ext = ext.to_lowercase();
        if AUDIO.contains(&ext.as_str()) || VIDEO.contains(&ext.as_str()) {
            stem = head;
        } else {
            break;
        }
    }
    let mut words: Vec<String> = stem
        .to_lowercase()
        .split(|c: char| c.is_whitespace() || "-_()[].,".contains(c))
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect();
    let mut removed: Vec<String> = Vec::new();
    let mut backing = false;
    loop {
        // «Camera 2», «Angle 3»: the number goes with the word before it
        let number = words
            .last()
            .filter(|w| w.chars().all(|c| c.is_ascii_digit()) && words.len() >= 2)
            .cloned();
        let tail_from = usize::from(number.is_some());
        let found = [ANGLE_WORDS, BACKING_WORDS, OTHER_WORDS]
            .iter()
            .enumerate()
            .flat_map(|(group, list)| list.iter().map(move |w| (group, *w)))
            .find(|(_, phrase)| {
                let parts: Vec<&str> = phrase.split(' ').collect();
                let end = words.len() - tail_from;
                end > parts.len()
                    && words[end - parts.len()..end]
                        .iter()
                        .zip(&parts)
                        .all(|(a, b)| a == b)
            });
        let Some((group, phrase)) = found else {
            break;
        };
        if number.is_some() && group != 0 {
            break;
        }
        let count = phrase.split(' ').count() + tail_from;
        let cut = words.len() - count;
        removed.insert(0, words.split_off(cut).join(" "));
        backing |= group == 1;
    }
    let label = removed
        .join(" ")
        .split(' ')
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            chars.next().map_or_else(String::new, |c| {
                c.to_uppercase().collect::<String>() + chars.as_str()
            })
        })
        .collect::<Vec<_>>()
        .join(" ");
    NameParts {
        key: words.join(" "),
        label,
        backing,
    }
}

/// The other media files of `track`'s folder with the same lesson name.
fn siblings(track: &Path) -> Vec<PathBuf> {
    let Some(name) = track.file_name().and_then(|n| n.to_str()) else {
        return Vec::new();
    };
    let key = name_parts(name).key;
    let Some(dir) = track.parent() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_file() && media_kind(p).is_some() && p.as_path() != track)
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| name_parts(n).key == key)
        })
        .collect();
    found.sort();
    found
}

fn new_file(path: &Path) -> Option<ExerciseFile> {
    let kind = media_kind(path)?;
    let parts = name_parts(path.file_name()?.to_str()?);
    Some(ExerciseFile {
        path: path.to_string_lossy().into_owned(),
        name: parts.label,
        kind,
        backing: parts.backing && kind == TakeKind::Audio,
        shift: 0.0,
        line_up: LineUp::Pending,
    })
}

fn load(conn: &Connection, id: i32) -> Result<Option<Exercise>, LibraryError> {
    let data: Option<String> = conn
        .query_row("SELECT data FROM exercises WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(match data {
        Some(json) => Some(Exercise {
            id,
            ..serde_json::from_str(&json)?
        }),
        None => None,
    })
}

/// The exercise `track` belongs to: by its path, else by its content (a moved folder).
fn exercise_of(conn: &Connection, track: &str) -> Result<Option<i32>, LibraryError> {
    let by_path: Option<i32> = conn
        .query_row(
            "SELECT exercise FROM exercise_files WHERE path_key = ?1",
            [path_key(track)],
            |r| r.get(0),
        )
        .optional()?;
    if by_path.is_some() {
        return Ok(by_path);
    }
    let Some(print) = fingerprint(Path::new(track)) else {
        return Ok(None);
    };
    Ok(conn
        .query_row(
            "SELECT exercise FROM exercise_files WHERE fingerprint = ?1",
            [print],
            |r| r.get(0),
        )
        .optional()?)
}

/// Saves the exercise (a new one gets its id) and which files belong to it.
pub fn save(conn: &Connection, exercise: &mut Exercise) -> Result<(), LibraryError> {
    let data = serde_json::to_string(&*exercise)?;
    if exercise.id > 0 {
        conn.execute(
            "INSERT INTO exercises (id, data) VALUES (?1, ?2)
             ON CONFLICT (id) DO UPDATE SET data = excluded.data",
            params![exercise.id, data],
        )?;
    } else {
        conn.execute("INSERT INTO exercises (data) VALUES (?1)", [data])?;
        exercise.id = i32::try_from(conn.last_insert_rowid())
            .map_err(|_| LibraryError::Invalid("too many exercises".into()))?;
    }
    conn.execute(
        "DELETE FROM exercise_files WHERE exercise = ?1",
        [exercise.id],
    )?;
    for file in &exercise.files {
        conn.execute(
            "INSERT INTO exercise_files (path_key, fingerprint, exercise) VALUES (?1, ?2, ?3)
             ON CONFLICT (path_key) DO UPDATE SET fingerprint = excluded.fingerprint,
                 exercise = excluded.exercise",
            params![
                path_key(&file.path),
                fingerprint(Path::new(&file.path)),
                exercise.id
            ],
        )?;
    }
    Ok(())
}

/// The exercise of `track`, brought up to date with its folder (new files join it, moved
/// ones are found by content, deleted ones leave); `None` when the track is alone.
pub fn open(conn: &Connection, track: &str) -> Result<Option<Exercise>, LibraryError> {
    let track_path = Path::new(track);
    let found = siblings(track_path);
    // A sibling may already be in an exercise that this track has not joined yet
    let mut id = exercise_of(conn, track)?;
    for sibling in &found {
        if id.is_some() {
            break;
        }
        id = exercise_of(conn, &sibling.to_string_lossy())?;
    }
    let mut exercise = match id {
        Some(id) => load(conn, id)?.unwrap_or(Exercise {
            id,
            files: Vec::new(),
            angle: None,
        }),
        None => Exercise {
            id: 0,
            files: Vec::new(),
            angle: None,
        },
    };
    let before = exercise.clone();

    let mut present: Vec<PathBuf> = vec![track_path.to_path_buf()];
    present.extend(found);
    let prints: Vec<Option<String>> = present.iter().map(|p| fingerprint(p)).collect();
    // Files gone from their place: found again by content, or dropped
    exercise.files.retain_mut(|file| {
        if Path::new(&file.path).is_file() && present.iter().any(|p| same(p, &file.path)) {
            return true;
        }
        let old = fingerprint(Path::new(&file.path)).or_else(|| stored_print(conn, &file.path));
        match present
            .iter()
            .zip(&prints)
            .find(|(_, print)| old.is_some() && **print == old)
        {
            Some((moved, _)) => {
                file.path = moved.to_string_lossy().into_owned();
                true
            }
            None => false,
        }
    });
    for path in &present {
        if !exercise.files.iter().any(|f| same(path, &f.path))
            && let Some(file) = new_file(path)
        {
            exercise.files.push(file);
        }
    }
    if exercise.files.len() < 2 {
        return Ok(None);
    }
    // The clock is the first file's: if none is lined up yet, the open track starts it
    if !exercise.files.iter().any(ExerciseFile::lined_up)
        && let Some(file) = exercise
            .files
            .iter_mut()
            .find(|f| same(track_path, &f.path))
    {
        file.shift = 0.0;
        file.line_up = LineUp::Sound;
    }
    if exercise != before || exercise.id == 0 {
        save(conn, &mut exercise)?;
    }
    Ok(Some(exercise))
}

fn stored_print(conn: &Connection, path: &str) -> Option<String> {
    conn.query_row(
        "SELECT fingerprint FROM exercise_files WHERE path_key = ?1",
        [path_key(path)],
        |r| r.get(0),
    )
    .ok()
    .flatten()
}

fn same(path: &Path, other: &str) -> bool {
    path_key(&path.to_string_lossy()) == path_key(other)
}

/// The exercise `track` belongs to, as saved.
pub fn of_track(conn: &Connection, track: &str) -> Result<Option<Exercise>, LibraryError> {
    match exercise_of(conn, track)? {
        Some(id) => load(conn, id),
        None => Ok(None),
    }
}

/// The shared parts of another file of the take, moved onto this file's times, saved and
/// returned, when they are newer than `own`'s, or when `own` is a copy of them made with
/// another shift between the two files (one of them was moved by hand since).
///
/// Only parts made on a file count as a source (never a copy of a copy).
pub fn share(
    conn: &Connection,
    track: &str,
    own: Option<&Project>,
) -> Result<Option<Project>, LibraryError> {
    let Some(exercise) = of_track(conn, track)? else {
        return Ok(None);
    };
    let Some(me) = exercise
        .files
        .iter()
        .find(|f| same(Path::new(track), &f.path) && f.lined_up())
    else {
        return Ok(None);
    };
    let own_time = own.map_or(0.0, |p| project::shared_time(conn, track, p));
    let own_from = own.and_then(|p| p.shared_from.as_deref());
    let mut best: Option<(f64, Project, &ExerciseFile)> = None;
    for file in exercise.files.iter().filter(|f| f.lined_up()) {
        if same(Path::new(track), &file.path) {
            continue;
        }
        let Some(other) = project::find(conn, &file.path)? else {
            continue;
        };
        if other.shared_from.is_some() {
            continue;
        }
        let time = project::shared_time(conn, &file.path, &other);
        if best.as_ref().is_none_or(|(t, _, _)| time > *t) {
            best = Some((time, other, file));
        }
    }
    let Some((time, other, source)) = best else {
        return Ok(None);
    };
    let delta = me.shift - source.shift;
    let copied_from_it = own_from.is_some_and(|from| path_key(from) == path_key(&source.path));
    let stale = copied_from_it
        && own.is_some_and(|p| (p.shared_delta - delta).abs() > 1e-6 || time > own_time);
    if !(time > own_time || stale) || time == 0.0 {
        return Ok(None);
    }
    let base = own.cloned().unwrap_or_default();
    let mut shared = project::take_shared(&base, &other, delta);
    shared.shared_at = time;
    shared.shared_from = Some(source.path.clone());
    project::store(conn, track, &shared)?;
    Ok(Some(shared))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::db::tests::memory;
    use crate::project::tests::temp_dir;
    use crate::project::{Marker, MarkerKind};

    #[test]
    fn names_split_into_lesson_and_take() {
        let p = name_parts("Exercise 01 Classic Warm-up Second Angle.mp4");
        assert_eq!(p.key, "exercise 01 classic warm up");
        assert_eq!(p.label, "Second Angle");
        let p = name_parts("Exercise 02 Classic Warm-up Twist Second Angle.mp4.mp4");
        assert_eq!(p.key, "exercise 02 classic warm up twist");
        let p = name_parts("Melody Solo - Backing Track.mp3");
        assert_eq!((p.key.as_str(), p.backing), ("melody solo", true));
        let p = name_parts("Lezione 3 (Camera 2).mov");
        assert_eq!(
            (p.key.as_str(), p.label.as_str()),
            ("lezione 3", "Camera 2")
        );
        // A name that is only a role word stays itself
        assert_eq!(name_parts("Base.mp3").key, "base");
        // Album tracks are told apart
        assert_ne!(
            name_parts("01. A Fortune In Lies.mp3").key,
            name_parts("02. Status Seeker.mp3").key
        );
    }

    fn folder(name: &str, files: &[&str]) -> PathBuf {
        let dir = temp_dir(name);
        for (i, file) in files.iter().enumerate() {
            fs::write(dir.join(file), vec![i as u8; 100 + i]).unwrap();
        }
        dir
    }

    #[test]
    fn a_lesson_folder_makes_one_exercise() {
        let dir = folder(
            "exercise-open",
            &[
                "Ex 01.mp4",
                "Ex 01 Second Angle.mp4",
                "Ex 01 Backing.mp3",
                "Ex 01 tab.gp",
                "Ex 02.mp4",
            ],
        );
        let conn = memory();
        let track = dir.join("Ex 01.mp4").to_string_lossy().into_owned();
        let ex = open(&conn, &track).unwrap().unwrap();
        assert_eq!(ex.files.len(), 3);
        assert_eq!(ex.files[0].line_up, LineUp::Sound);
        assert!(
            ex.files
                .iter()
                .any(|f| f.backing && f.kind == TakeKind::Audio)
        );
        // Opening another file of it finds the same exercise
        let other = dir.join("Ex 01 Backing.mp3").to_string_lossy().into_owned();
        assert_eq!(open(&conn, &other).unwrap().unwrap().id, ex.id);
        // A lone file has none
        let alone = dir.join("Ex 02.mp4").to_string_lossy().into_owned();
        assert!(open(&conn, &alone).unwrap().is_none());
    }

    #[test]
    fn a_moved_folder_keeps_the_shifts() {
        let dir = folder("exercise-moved", &["Ex.mp4", "Ex Close Up.mp4"]);
        let conn = memory();
        let track = dir.join("Ex.mp4").to_string_lossy().into_owned();
        let mut ex = open(&conn, &track).unwrap().unwrap();
        ex.files[1].shift = 0.25;
        ex.files[1].line_up = LineUp::Hand;
        save(&conn, &mut ex).unwrap();
        let moved = dir.with_file_name("exercise-moved-2");
        let _ = fs::remove_dir_all(&moved);
        fs::rename(&dir, &moved).unwrap();
        let track = moved.join("Ex.mp4").to_string_lossy().into_owned();
        let again = open(&conn, &track).unwrap().unwrap();
        assert_eq!(again.id, ex.id);
        let close = again.files.iter().find(|f| f.name == "Close Up").unwrap();
        assert_eq!(close.shift, 0.25);
        assert!(close.path.contains("exercise-moved-2"));
    }

    #[test]
    fn the_newest_sync_is_shared_moved_by_the_shift() {
        let dir = folder("exercise-share", &["Ex.mp4", "Ex.mp3"]);
        let conn = memory();
        let video = dir.join("Ex.mp4").to_string_lossy().into_owned();
        let audio = dir.join("Ex.mp3").to_string_lossy().into_owned();
        let mut ex = open(&conn, &video).unwrap().unwrap();
        let mp3 = ex.files.iter_mut().find(|f| f.path == audio).unwrap();
        mp3.shift = -0.5;
        mp3.line_up = LineUp::Sound;
        save(&conn, &mut ex).unwrap();

        let synced = Project {
            markers: vec![Marker {
                id: "a".into(),
                time: 10.0,
                kind: MarkerKind::Free,
                label: String::new(),
            }],
            speed: 0.5,
            ..Project::default()
        };
        project::save(&conn, &video, &synced).unwrap();
        let got = share(&conn, &audio, None).unwrap().unwrap();
        assert!((got.markers[0].time - 9.5).abs() < 1e-9);
        // Speed is the file's own
        assert_eq!(got.speed, 1.0);
        // Now both are as new: nothing more to share either way
        assert!(share(&conn, &audio, Some(&got)).unwrap().is_none());
        let video_project = project::find(&conn, &video).unwrap().unwrap();
        assert!(
            share(&conn, &video, Some(&video_project))
                .unwrap()
                .is_none()
        );
    }
}
