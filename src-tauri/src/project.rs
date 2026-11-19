//! The project of each track (markers, sections, loops, tempo, mix…), kept in the library.
//!
//! The schema lives here only: the TypeScript types are generated from it. A project is stored
//! as JSON in the `projects` table, keyed by the track's path; a fingerprint of the file's
//! content finds it again when the track is moved, renamed or copied.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use audio_engine::{ChannelMode, EqSettings};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::db::{LibraryError, path_key};
use crate::hash::fnv1a;

/// Bumped when the format changes in a way older readers cannot handle.
pub const VERSION: u32 = 1;
/// Bytes read at the start and at the end of a track for its fingerprint.
const FINGERPRINT_SPAN: u64 = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MarkerKind {
    /// A point of interest, optionally labelled
    Free,
    /// Start of a bar: numbered in order by the UI
    Beat,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub id: String,
    /// Seconds
    pub time: f64,
    pub kind: MarkerKind,
    #[serde(default)]
    pub label: String,
}

/// A part of the track with a name, like a Reaper region: it runs from `start` to `end`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    /// Seconds
    pub start: f64,
    /// Seconds. Missing in files of versions where a section ran up to the next one: the UI
    /// then gives it the next section's start (or the end of the track)
    #[serde(default)]
    pub end: Option<f64>,
    pub name: String,
    /// Index into the section palette of `theme.css`
    pub color: u8,
    /// The player's own words about it ("watch the bend at 0:42"), shown while it plays
    #[serde(default)]
    pub memo: String,
}

/// A loop kept under a name, to come back to it later.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedLoop {
    pub id: String,
    pub name: String,
    /// Seconds
    pub start: f64,
    pub end: f64,
    /// The player's own words about it, shown while it plays
    #[serde(default)]
    pub memo: String,
}

/// One step of the practice playlist: a saved loop played a number of times.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistStep {
    /// Id of a `SavedLoop`
    pub loop_id: String,
    /// Times it is played before the next step
    pub repeats: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectLoop {
    pub enabled: bool,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub lead_in: f64,
    pub gap: f64,
}

impl Default for ProjectLoop {
    fn default() -> Self {
        Self {
            enabled: false,
            start: None,
            end: None,
            lead_in: 0.0,
            gap: 0.0,
        }
    }
}

/// A tempo marker, like those of Reaper: from `time` (a first beat of a bar) on, this tempo and
/// this meter, until the next marker.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TempoMarker {
    /// Seconds
    pub time: f64,
    /// Quarter notes per minute
    pub bpm: f64,
    pub beats_per_bar: u32,
    pub beat_unit: u32,
    /// Proposed by the tempo analysis and not touched since; a marker the user edits or adds
    /// is theirs, and a new analysis keeps it
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub auto: bool,
}

/// Which staves of the score are drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScoreStaves {
    Tab,
    Notation,
    Both,
}

/// How the score is laid out: systems one under the other, or one long line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScoreLayout {
    Page,
    Horizontal,
}

/// How the view follows the playhead: scrolling all the time, or a screen at a time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScoreFollow {
    Continuous,
    Paged,
    Off,
}

/// Where a point of the score falls in the recording: the start of bar `bar` (0-based, as
/// written) on its `occurrence`-th time through (repeats), plus `position` (0..1) of the bar.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncPoint {
    pub bar: u32,
    #[serde(default)]
    pub occurrence: u32,
    #[serde(default)]
    pub position: f64,
    /// Seconds in the recording
    pub time: f64,
}

/// The score linked to a track: the file in the library's `spartiti` folder and how it is shown.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScore {
    /// Name in the `spartiti` folder (by content)
    pub file: String,
    /// Name of the user's original file, to show
    pub name: String,
    pub kind: crate::scores::ScoreKind,
    /// Indexes of the score's tracks drawn (guitar, bass…); empty = the first
    #[serde(default)]
    pub tracks: Vec<u32>,
    #[serde(default = "ScoreStaves::default_staves")]
    pub staves: ScoreStaves,
    #[serde(default = "ScoreLayout::default_layout")]
    pub layout: ScoreLayout,
    #[serde(default = "ScoreFollow::default_follow")]
    pub follow: ScoreFollow,
    /// Size of the drawing, 1 = normal
    #[serde(default = "one")]
    pub zoom: f64,
    /// Where bars fall in the recording; empty = the score's own tempo from 0 s
    #[serde(default)]
    pub sync: Vec<SyncPoint>,
    /// PDF only: the bars on its pages, in reading order (found once, then as the user fixed
    /// them); empty until found
    #[serde(default)]
    pub pdf_bars: Vec<PdfBar>,
}

/// A bar on a page of a PDF score: a box in 0..1 of the page.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PdfBar {
    /// 0-based page number
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

const fn one() -> f64 {
    1.0
}

impl ScoreStaves {
    const fn default_staves() -> Self {
        Self::Both
    }
}

impl ScoreLayout {
    const fn default_layout() -> Self {
        Self::Page
    }
}

impl ScoreFollow {
    const fn default_follow() -> Self {
        Self::Continuous
    }
}

/// Everything remembered about one track. Missing fields take their defaults,
/// so files written by older versions still open.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct Project {
    pub version: u32,
    pub markers: Vec<Marker>,
    pub sections: Vec<Section>,
    #[serde(rename = "loop")]
    pub loop_: ProjectLoop,
    /// Loops saved by name
    pub loops: Vec<SavedLoop>,
    /// Practice playlist: saved loops in order, each played a number of times
    pub playlist: Vec<PlaylistStep>,
    /// Seconds: where the playhead was, so reopening the track goes back there
    pub position: f64,
    /// Tempo of the track in beats per minute; `None` until the user sets it
    pub bpm: Option<f64>,
    /// Seconds: a moment on the first beat of a bar, where the beat grid lines up
    pub beat_offset: Option<f64>,
    /// Time signature: beats in a bar (top number) and the note value of a beat (bottom number),
    /// e.g. 7 and 8 for 7/8
    pub beats_per_bar: u32,
    pub beat_unit: u32,
    /// Where tempo and meter change (the fields above repeat its first marker, so a project
    /// still opens in versions that had a single tempo). Empty in older files: their single
    /// tempo is then the map
    pub tempo_map: Vec<TempoMarker>,
    pub speed: f64,
    pub semitones: i32,
    pub cents: i32,
    pub eq: EqSettings,
    pub channels: ChannelMode,
    /// Levels, Mute and Solo of the separated tracks (empty until the song is separated)
    pub stem_mix: Vec<StemChannel>,
    /// The linked score (tab, notation or PDF), if any
    pub score: Option<ProjectScore>,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            version: VERSION,
            markers: Vec::new(),
            sections: Vec::new(),
            loop_: ProjectLoop::default(),
            loops: Vec::new(),
            playlist: Vec::new(),
            position: 0.0,
            bpm: None,
            beat_offset: None,
            beats_per_bar: 4,
            beat_unit: 4,
            tempo_map: Vec::new(),
            speed: 1.0,
            semitones: 0,
            cents: 0,
            eq: EqSettings::default(),
            channels: ChannelMode::Stereo,
            stem_mix: Vec::new(),
            score: None,
        }
    }
}

/// One separated track in the mixer: which one, its level and its keys.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StemChannel {
    /// "vocals", "drums", "bass", "guitar", "piano", "other"
    pub name: String,
    /// 0..1
    pub level: f64,
    pub mute: bool,
    pub solo: bool,
}

/// Seconds since 1970.
pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64())
}

/// What identifies a track's content wherever it is: its size and a hash of its first and last
/// 64 KB. Quick even on a large video, and different for any two real recordings.
pub fn fingerprint(track: &Path) -> Option<String> {
    let read = || -> io::Result<String> {
        let mut file = File::open(track)?;
        let size = file.metadata()?.len();
        let mut bytes = Vec::with_capacity(2 * FINGERPRINT_SPAN as usize);
        (&mut file).take(FINGERPRINT_SPAN).read_to_end(&mut bytes)?;
        if size > FINGERPRINT_SPAN {
            file.seek(SeekFrom::Start(
                size.saturating_sub(FINGERPRINT_SPAN).max(FINGERPRINT_SPAN),
            ))?;
            file.take(FINGERPRINT_SPAN).read_to_end(&mut bytes)?;
        }
        Ok(format!("{size:x}-{:016x}", fnv1a(&bytes)))
    };
    read().ok()
}

/// A project read from its JSON, refusing what a newer Looplab wrote.
pub fn parse(json: &str) -> Result<Project, LibraryError> {
    let project: Project = serde_json::from_str(json)?;
    if project.version > VERSION {
        return Err(LibraryError::Invalid(format!(
            "written by a newer Looplab (format {})",
            project.version
        )));
    }
    Ok(project)
}

/// The project saved under exactly this path, if any.
pub fn find(conn: &Connection, track: &str) -> Result<Option<Project>, LibraryError> {
    conn.query_row(
        "SELECT data FROM projects WHERE path_key = ?1",
        [path_key(track)],
        |row| row.get::<_, String>(0),
    )
    .optional()?
    .map(|json| parse(&json))
    .transpose()
}

/// The project of a track that was moved, renamed or copied: one saved with the same content.
/// A moved track takes its project along; a copy gets its own copy of it.
fn find_by_content(conn: &Connection, track: &str) -> Result<Option<Project>, LibraryError> {
    let Some(print) = fingerprint(Path::new(track)) else {
        return Ok(None);
    };
    let mut query = conn.prepare(
        "SELECT path_key, path, data FROM projects WHERE fingerprint = ?1 ORDER BY updated_at DESC",
    )?;
    let found: Vec<(String, String, String)> = query
        .query_map([&print], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    // Prefer a project whose track is gone: that is the same file, moved
    let Some((old_key, old_path, data)) = found
        .iter()
        .find(|(_, path, _)| !Path::new(path).exists())
        .or(found.first())
        .cloned()
    else {
        return Ok(None);
    };
    let project = parse(&data)?;
    if Path::new(&old_path).exists() {
        insert(conn, track, Some(&print), &data)?;
    } else {
        conn.execute(
            "UPDATE projects SET path_key = ?1, path = ?2 WHERE path_key = ?3",
            params![path_key(track), track, old_key],
        )?;
    }
    Ok(Some(project))
}

/// Writes the project of `track`, replacing the one it had.
pub fn insert(
    conn: &Connection,
    track: &str,
    print: Option<&str>,
    data: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO projects (path_key, path, fingerprint, data, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (path_key) DO UPDATE SET path = excluded.path,
             fingerprint = COALESCE(excluded.fingerprint, projects.fingerprint),
             data = excluded.data, updated_at = excluded.updated_at",
        params![path_key(track), track, print, data, now()],
    )?;
    Ok(())
}

/// The project of a track, or `None` if it has none yet. Looks by path, then for a project file
/// of an older version beside the track (imported once), then by content.
pub fn load(
    conn: &Connection,
    track: &str,
    old_files: &Path,
) -> Result<Option<Project>, LibraryError> {
    if let Some(project) = find(conn, track)? {
        return Ok(Some(project));
    }
    if let Some(project) = crate::legacy::import_beside_track(conn, track, old_files)? {
        return Ok(Some(project));
    }
    find_by_content(conn, track)
}

/// Saves the project of a track.
pub fn save(conn: &Connection, track: &str, project: &Project) -> Result<(), LibraryError> {
    let project = Project {
        version: VERSION,
        ..project.clone()
    };
    let data = serde_json::to_string(&project)?;
    insert(conn, track, fingerprint(Path::new(track)).as_deref(), &data)?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;
    use crate::db::tests::memory;

    /// A fresh folder under the shared cargo target dir (on the Dev Drive, never in C:\ Temp).
    pub(crate) fn temp_dir(name: &str) -> PathBuf {
        let target = std::env::var_os("CARGO_TARGET_DIR").expect("CARGO_TARGET_DIR must be set");
        let dir = PathBuf::from(target)
            .join("tmp")
            .join("looplab-tests")
            .join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample() -> Project {
        Project {
            markers: vec![Marker {
                id: "m1".into(),
                time: 12.5,
                kind: MarkerKind::Beat,
                label: String::new(),
            }],
            sections: vec![Section {
                id: "s1".into(),
                start: 3.0,
                end: Some(9.0),
                name: "Intro".into(),
                color: 2,
                memo: "Pennata alternata".into(),
            }],
            loop_: ProjectLoop {
                enabled: true,
                start: Some(3.0),
                end: Some(9.0),
                lead_in: 1.5,
                gap: 0.0,
            },
            loops: vec![SavedLoop {
                id: "l1".into(),
                name: "Riff".into(),
                start: 3.0,
                end: 9.0,
                memo: String::new(),
            }],
            playlist: vec![PlaylistStep {
                loop_id: "l1".into(),
                repeats: 4,
            }],
            position: 42.5,
            bpm: Some(96.0),
            beat_offset: Some(0.42),
            beats_per_bar: 7,
            beat_unit: 8,
            speed: 0.75,
            semitones: -2,
            cents: 15,
            ..Project::default()
        }
    }

    fn track(dir: &Path, name: &str, content: &[u8]) -> String {
        let path = dir.join(name);
        fs::write(&path, content).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn saves_and_loads_by_path_ignoring_case() {
        let dir = temp_dir("project-path");
        let conn = memory();
        let song = track(&dir, "Song.mp3", b"audio");
        save(&conn, &song, &sample()).unwrap();
        assert_eq!(load(&conn, &song, &dir).unwrap(), Some(sample()));
        let upper = song.to_uppercase();
        assert_eq!(load(&conn, &upper, &dir).unwrap(), Some(sample()));
    }

    #[test]
    fn a_track_without_project_has_none() {
        let dir = temp_dir("project-none");
        let conn = memory();
        let song = track(&dir, "song.mp3", b"nothing saved");
        assert!(load(&conn, &song, &dir).unwrap().is_none());
    }

    #[test]
    fn a_moved_track_takes_its_project_along() {
        let dir = temp_dir("project-moved");
        let conn = memory();
        let old = track(&dir, "old.mp3", &[3u8; 200_000]);
        save(&conn, &old, &sample()).unwrap();
        let new = dir.join("renamed.mp3").to_string_lossy().into_owned();
        fs::rename(&old, &new).unwrap();
        assert_eq!(load(&conn, &new, &dir).unwrap(), Some(sample()));
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1, "moved, not copied");
        assert!(find(&conn, &old).unwrap().is_none());
    }

    #[test]
    fn a_copied_track_gets_its_own_copy_of_the_project() {
        let dir = temp_dir("project-copied");
        let conn = memory();
        let first = track(&dir, "a.mp3", b"same take");
        save(&conn, &first, &sample()).unwrap();
        let copy = track(&dir, "b.mp3", b"same take");
        assert_eq!(load(&conn, &copy, &dir).unwrap(), Some(sample()));
        assert_eq!(find(&conn, &first).unwrap(), Some(sample()));
        assert_eq!(find(&conn, &copy).unwrap(), Some(sample()));
    }

    #[test]
    fn reads_older_projects_and_rejects_newer_ones() {
        let old = parse(r#"{ "version": 1, "markers": [] }"#).unwrap();
        assert_eq!(old.speed, 1.0);
        assert!(old.sections.is_empty());
        assert!(matches!(parse("{ not json"), Err(LibraryError::Invalid(_))));
        assert!(matches!(
            parse(r#"{ "version": 99 }"#),
            Err(LibraryError::Invalid(_))
        ));
    }

    #[test]
    fn the_fingerprint_follows_the_content() {
        let dir = temp_dir("project-print");
        let a = track(&dir, "a.wav", &[1u8; 300_000]);
        let b = track(&dir, "b.wav", &[1u8; 300_000]);
        let mut changed = vec![1u8; 300_000];
        changed[299_999] = 2;
        let c = track(&dir, "c.wav", &changed);
        let print = |p: &str| fingerprint(Path::new(p)).unwrap();
        assert_eq!(print(&a), print(&b));
        assert_ne!(print(&a), print(&c));
    }
}
