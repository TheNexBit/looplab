//! The `.looplab.json` project file saved next to each track.
//!
//! The schema lives here only: the TypeScript types are generated from it.
//! Files are written atomically (temporary file + rename), so a crash never leaves
//! a half-written project. When the track's folder is read-only, the project goes
//! to the app data folder instead.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use audio_engine::{ChannelMode, EqSettings};
use serde::{Deserialize, Serialize};

use crate::hash::fnv1a;
use crate::json_file::write_atomically;

/// Bumped when the format changes in a way older readers cannot handle.
pub const VERSION: u32 = 1;
const EXTENSION: &str = "looplab.json";

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

/// A section runs from its start to the start of the next one (or the end of the track).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    /// Seconds
    pub start: f64,
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
    pub speed: f64,
    pub semitones: i32,
    pub cents: i32,
    pub eq: EqSettings,
    pub channels: ChannelMode,
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
            speed: 1.0,
            semitones: 0,
            cents: 0,
            eq: EqSettings::default(),
            channels: ChannelMode::Stereo,
        }
    }
}

/// Where a project file is kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ProjectLocation {
    /// Next to the track, so it travels with it
    BesideTrack,
    /// In the app data folder, because the track's folder is read-only
    AppData,
}

#[derive(Debug)]
pub enum ProjectError {
    Io(io::Error),
    /// The file exists but is not a project we can read
    Invalid(String),
}

impl std::fmt::Display for ProjectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "project file error: {err}"),
            Self::Invalid(detail) => write!(f, "invalid project file: {detail}"),
        }
    }
}

impl From<io::Error> for ProjectError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

/// `song.mp3` → `song.mp3.looplab.json` (keeping the extension avoids clashes with `song.wav`).
pub fn beside_track(track: &Path) -> PathBuf {
    let mut name = track.file_name().unwrap_or_default().to_os_string();
    name.push(".");
    name.push(EXTENSION);
    track.with_file_name(name)
}

/// Fallback location in the app data folder, named after a stable hash of the track path.
pub fn in_app_data(data_dir: &Path, track: &Path) -> PathBuf {
    let key = track.to_string_lossy().to_lowercase();
    data_dir
        .join("projects")
        .join(format!("{:016x}.{EXTENSION}", fnv1a(key.as_bytes())))
}

/// Reads the track's project from wherever it was saved, or `None` if it has none yet.
pub fn load(
    data_dir: &Path,
    track: &Path,
) -> Result<Option<(Project, ProjectLocation)>, ProjectError> {
    for (path, location) in [
        (beside_track(track), ProjectLocation::BesideTrack),
        (in_app_data(data_dir, track), ProjectLocation::AppData),
    ] {
        match fs::read_to_string(&path) {
            Ok(text) => {
                let project: Project = serde_json::from_str(&text)
                    .map_err(|e| ProjectError::Invalid(e.to_string()))?;
                if project.version > VERSION {
                    return Err(ProjectError::Invalid(format!(
                        "written by a newer Looplab (format {})",
                        project.version
                    )));
                }
                return Ok(Some((project, location)));
            }
            Err(err) if err.kind() == io::ErrorKind::NotFound => {}
            Err(err) => return Err(err.into()),
        }
    }
    Ok(None)
}

/// Saves next to the track, falling back to the app data folder if that folder is read-only.
pub fn save(
    data_dir: &Path,
    track: &Path,
    project: &Project,
) -> Result<ProjectLocation, ProjectError> {
    let project = Project {
        version: VERSION,
        ..project.clone()
    };
    let json =
        serde_json::to_string_pretty(&project).map_err(|e| ProjectError::Invalid(e.to_string()))?;

    let beside = beside_track(track);
    match write_atomically(&beside, &json) {
        Ok(()) => {
            // A copy left in app data from a time the folder was read-only is now stale
            let _ = fs::remove_file(in_app_data(data_dir, track));
            Ok(ProjectLocation::BesideTrack)
        }
        Err(err) if err.kind() == io::ErrorKind::PermissionDenied => {
            let fallback = in_app_data(data_dir, track);
            if let Some(dir) = fallback.parent() {
                fs::create_dir_all(dir)?;
            }
            write_atomically(&fallback, &json)?;
            Ok(ProjectLocation::AppData)
        }
        Err(err) => Err(err.into()),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

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

    #[test]
    fn names_the_file_after_the_full_track_name() {
        let path = beside_track(Path::new(r"D:\music\song.mp3"));
        assert_eq!(path, PathBuf::from(r"D:\music\song.mp3.looplab.json"));
    }

    #[test]
    fn saves_and_loads_beside_the_track() {
        let dir = temp_dir("beside");
        let track = dir.join("song.mp3");
        let location = save(&dir.join("data"), &track, &sample()).unwrap();
        assert_eq!(location, ProjectLocation::BesideTrack);
        let (loaded, from) = load(&dir.join("data"), &track).unwrap().unwrap();
        assert_eq!(loaded, sample());
        assert_eq!(from, ProjectLocation::BesideTrack);
        assert!(
            !beside_track(&track).with_extension("json.tmp").exists(),
            "no temporary file left"
        );
    }

    #[test]
    fn a_track_without_project_has_none() {
        let dir = temp_dir("none");
        assert!(load(&dir, &dir.join("song.mp3")).unwrap().is_none());
    }

    #[test]
    fn reads_older_files_with_missing_fields() {
        let dir = temp_dir("old");
        let track = dir.join("song.wav");
        fs::write(beside_track(&track), r#"{ "version": 1, "markers": [] }"#).unwrap();
        let (loaded, _) = load(&dir, &track).unwrap().unwrap();
        assert_eq!(loaded.speed, 1.0);
        assert!(loaded.sections.is_empty());
    }

    #[test]
    fn rejects_damaged_or_newer_files() {
        let dir = temp_dir("bad");
        let track = dir.join("song.flac");
        fs::write(beside_track(&track), "{ not json").unwrap();
        assert!(matches!(load(&dir, &track), Err(ProjectError::Invalid(_))));
        fs::write(beside_track(&track), r#"{ "version": 99 }"#).unwrap();
        assert!(matches!(load(&dir, &track), Err(ProjectError::Invalid(_))));
    }

    #[test]
    fn app_data_name_is_stable_and_case_insensitive() {
        let data = Path::new(r"D:\data");
        assert_eq!(
            in_app_data(data, Path::new(r"D:\Music\Song.mp3")),
            in_app_data(data, Path::new(r"d:\music\song.mp3"))
        );
        assert_ne!(
            in_app_data(data, Path::new(r"D:\music\a.mp3")),
            in_app_data(data, Path::new(r"D:\music\b.mp3"))
        );
    }
}
