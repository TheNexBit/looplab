//! Setlists: the songs of a gig in playing order, each with its Live settings (cue in and out,
//! transpose, speed, stage notes). Kept in the library (`setlists` table, one JSON row each):
//! nothing is written beside the media, and the backups carry them with the rest.
//!
//! A song may have no file (only a title, a BPM and a planned length): it still counts in the
//! set's total and shows on the Stage view.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::db::{LibraryError, path_key};

/// Live speed limits, the same as the player's (`audio_engine::MIN_SPEED`/`MAX_SPEED`).
const SPEED: (f64, f64) = (
    audio_engine::MIN_SPEED as f64,
    audio_engine::MAX_SPEED as f64,
);
/// Transpose limits in semitones, the same as the player's.
const SEMITONES: (i32, i32) = (-12, 12);
/// BPM limits of a song without file, the same as the metronome's.
const BPM: (f64, f64) = (20.0, 400.0);
/// Gap between songs in Live mode, seconds (0 = wait for the next key).
const MAX_GAP: u32 = 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SetlistSong {
    /// Made by the app, never shown: tells two songs apart when they are dragged
    pub id: String,
    /// The audio or video file; `None` for a song played without a recording
    pub path: Option<String>,
    pub title: String,
    /// Length of the whole file (read when added), or the planned length of a song without file
    pub length: Option<f64>,
    /// Live starts here (seconds in the file); `None` = from the start
    pub cue_in: Option<f64>,
    /// Live stops here; `None` = at the end
    pub cue_out: Option<f64>,
    /// Live transpose in semitones; `None` = as in the track's project
    pub semitones: Option<i32>,
    /// Live speed (1 = original); `None` = original speed
    pub speed: Option<f64>,
    /// For the count-in and a song without file
    pub bpm: Option<f64>,
    /// Stage notes: tuning, capo, sound, who starts…
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Setlist {
    /// Empty for a new setlist: saving gives it one
    pub id: String,
    pub name: String,
    /// Day of the gig, `YYYY-MM-DD`
    pub date: Option<String>,
    #[serde(default)]
    pub venue: String,
    /// How long the set may last, minutes
    pub limit_minutes: Option<u32>,
    /// Seconds between songs in Live mode; 0 = wait for the next key
    #[serde(default)]
    pub gap_seconds: u32,
    pub songs: Vec<SetlistSong>,
}

/// A song file as it is now on the disk.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SongFile {
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SetlistLibrary {
    /// Next gig first, then the ones without a date, then the past ones
    pub setlists: Vec<Setlist>,
    /// Every file named by a setlist, once
    pub files: Vec<SongFile>,
}

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |t| t.as_secs_f64())
}

fn today() -> String {
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm), local enough for a gig day
    let days = (now() / 86_400.0).floor() as i64;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

/// A `YYYY-MM-DD` date, or `None`.
fn valid_date(date: Option<String>) -> Option<String> {
    let date = date?;
    let parts: Vec<&str> = date.split('-').collect();
    let ok = parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
        && (1..=12).contains(&parts[1].parse::<u32>().unwrap_or(0))
        && (1..=31).contains(&parts[2].parse::<u32>().unwrap_or(0));
    ok.then_some(date)
}

fn positive(value: Option<f64>) -> Option<f64> {
    value.filter(|v| v.is_finite() && *v >= 0.0)
}

/// Keeps every value in range, so a damaged or hand-made row never reaches the player.
fn tidy(mut setlist: Setlist) -> Setlist {
    setlist.name = setlist.name.trim().to_string();
    setlist.venue = setlist.venue.trim().to_string();
    setlist.date = valid_date(setlist.date);
    setlist.limit_minutes = setlist.limit_minutes.filter(|m| (1..=600).contains(m));
    setlist.gap_seconds = setlist.gap_seconds.min(MAX_GAP);
    for song in &mut setlist.songs {
        song.title = song.title.trim().to_string();
        song.path = song.path.take().filter(|p| !p.trim().is_empty());
        song.length = positive(song.length).filter(|l| *l > 0.0);
        song.cue_in = positive(song.cue_in).filter(|c| *c > 0.0);
        song.cue_out = positive(song.cue_out);
        if let (Some(start), Some(end)) = (song.cue_in, song.cue_out)
            && end <= start
        {
            song.cue_out = None;
        }
        song.semitones = song.semitones.map(|s| s.clamp(SEMITONES.0, SEMITONES.1));
        song.speed = song
            .speed
            .filter(|s| s.is_finite())
            .map(|s| s.clamp(SPEED.0, SPEED.1));
        song.bpm = song
            .bpm
            .filter(|b| b.is_finite())
            .map(|b| b.clamp(BPM.0, BPM.1));
    }
    setlist
}

/// The length of a file: from the recent list when it was opened once, else from its header.
fn file_length(conn: &Connection, path: &str) -> Option<f64> {
    let known: Option<f64> = conn
        .query_row(
            "SELECT duration FROM recent WHERE path_key = ?1",
            [path_key(path)],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    known.filter(|d| *d > 0.0).or_else(|| {
        let decoder = audio_engine::decode::Decoder::open(Path::new(path)).ok()?;
        let frames = decoder.total_frames()?;
        Some(frames as f64 / f64::from(decoder.sample_rate()))
    })
}

fn sort(setlists: &mut [Setlist]) {
    let today = today();
    // Upcoming (soonest first), then undated (by name), then past (latest first)
    let rank = |s: &Setlist| match &s.date {
        Some(d) if *d >= today => 0,
        None => 1,
        Some(_) => 2,
    };
    setlists.sort_by(|a, b| {
        rank(a)
            .cmp(&rank(b))
            .then_with(|| match (rank(a), &a.date, &b.date) {
                (0, Some(x), Some(y)) => x.cmp(y),
                (2, Some(x), Some(y)) => y.cmp(x),
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            })
    });
}

/// Every setlist, and whether their files are still there.
pub fn library(conn: &Connection) -> Result<SetlistLibrary, LibraryError> {
    let mut statement = conn.prepare("SELECT data FROM setlists")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut setlists = Vec::new();
    for row in rows {
        // A damaged row is skipped, the others still show
        if let Ok(setlist) = serde_json::from_str::<Setlist>(&row?) {
            setlists.push(tidy(setlist));
        }
    }
    sort(&mut setlists);
    let mut files: Vec<SongFile> = Vec::new();
    for path in setlists
        .iter()
        .flat_map(|s| s.songs.iter())
        .filter_map(|song| song.path.as_deref())
    {
        if !files.iter().any(|f| path_key(&f.path) == path_key(path)) {
            files.push(SongFile {
                path: path.to_string(),
                exists: Path::new(path).is_file(),
            });
        }
    }
    Ok(SetlistLibrary { setlists, files })
}

/// Saves a setlist (a new one gets its id); songs with a file get its length when not known.
pub fn save(conn: &Connection, setlist: Setlist) -> Result<Setlist, LibraryError> {
    let mut setlist = tidy(setlist);
    if setlist.id.is_empty() {
        let mut stamp = (now() * 1000.0) as u64;
        // Two made in the same millisecond (a quick duplicate) still get different ids
        while conn
            .query_row(
                "SELECT 1 FROM setlists WHERE id = ?1",
                [format!("set-{stamp}")],
                |_| Ok(()),
            )
            .optional()?
            .is_some()
        {
            stamp += 1;
        }
        setlist.id = format!("set-{stamp}");
    }
    for song in &mut setlist.songs {
        if song.length.is_none()
            && let Some(path) = song.path.as_deref()
        {
            song.length = file_length(conn, path);
        }
    }
    let data = serde_json::to_string(&setlist)?;
    conn.execute(
        "INSERT INTO setlists (id, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        params![setlist.id, data, now()],
    )?;
    Ok(setlist)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), LibraryError> {
    conn.execute("DELETE FROM setlists WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::memory;

    fn song(title: &str) -> SetlistSong {
        SetlistSong {
            id: title.into(),
            path: None,
            title: title.into(),
            length: Some(200.0),
            cue_in: None,
            cue_out: None,
            semitones: None,
            speed: None,
            bpm: None,
            notes: String::new(),
        }
    }

    fn setlist(name: &str, date: Option<&str>) -> Setlist {
        Setlist {
            id: String::new(),
            name: name.into(),
            date: date.map(Into::into),
            venue: String::new(),
            limit_minutes: None,
            gap_seconds: 0,
            songs: vec![song("Uno"), song("Due")],
        }
    }

    #[test]
    fn saves_reads_and_deletes() {
        let conn = memory();
        let saved = save(&conn, setlist("Pub", Some("2099-01-01"))).unwrap();
        assert!(saved.id.starts_with("set-"));
        let again = save(
            &conn,
            Setlist {
                name: "Pub 2".into(),
                ..saved.clone()
            },
        )
        .unwrap();
        assert_eq!(again.id, saved.id);
        let copy = save(
            &conn,
            Setlist {
                id: String::new(),
                ..saved.clone()
            },
        )
        .unwrap();
        assert_ne!(copy.id, saved.id);
        let library = library(&conn).unwrap();
        assert_eq!(library.setlists.len(), 2);
        assert_eq!(library.setlists[0].songs.len(), 2);
        delete(&conn, &saved.id).unwrap();
        assert_eq!(super::library(&conn).unwrap().setlists.len(), 1);
    }

    #[test]
    fn keeps_values_in_range() {
        let mut set = setlist("  Festa  ", Some("not a date"));
        set.gap_seconds = 999;
        set.songs[0].speed = Some(9.0);
        set.songs[0].semitones = Some(40);
        set.songs[0].cue_in = Some(30.0);
        set.songs[0].cue_out = Some(10.0);
        set.songs[0].bpm = Some(f64::NAN);
        let set = tidy(set);
        assert_eq!(set.name, "Festa");
        assert_eq!(set.date, None);
        assert_eq!(set.gap_seconds, MAX_GAP);
        assert_eq!(set.songs[0].speed, Some(SPEED.1));
        assert_eq!(set.songs[0].semitones, Some(12));
        assert_eq!(set.songs[0].cue_out, None);
        assert_eq!(set.songs[0].bpm, None);
    }

    #[test]
    fn next_gig_first_then_undated_then_past() {
        let mut sets = vec![
            Setlist {
                name: "Past".into(),
                date: Some("2000-01-01".into()),
                ..setlist("", None)
            },
            Setlist {
                name: "Undated".into(),
                ..setlist("", None)
            },
            Setlist {
                name: "Later".into(),
                date: Some("2099-06-01".into()),
                ..setlist("", None)
            },
            Setlist {
                name: "Soon".into(),
                date: Some("2098-01-01".into()),
                ..setlist("", None)
            },
        ];
        sort(&mut sets);
        let names: Vec<&str> = sets.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Soon", "Later", "Undated", "Past"]);
    }

    #[test]
    fn today_is_a_valid_date() {
        assert!(valid_date(Some(today())).is_some());
    }
}
