//! "Export tracks": the separated tracks of a song saved as WAV files, ready for a DAW, in one
//! place — by default `Documents\Looplab\Tracce separate\<song>\voce.wav`, `chitarra.wav`…,
//! or a folder the user chose (kept in the library) — and never in the cache, which empties
//! itself. Each song folder has an `origine.txt` naming the song file it came from, so two
//! songs with the same name never overwrite each other.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use audio_engine::Pcm;
use audio_engine::wav::{BitDepth, WavWriter};
use rusqlite::Connection;

use crate::db;
use crate::paths::Places;

/// Names the song's folder after its file.
const ORIGIN: &str = "origine.txt";
/// The folder chosen by the user, in the library's `meta` table.
const CHOSEN: &str = "stems_out_dir";

/// The folder chosen by the user, if any.
pub fn chosen(conn: &Connection) -> rusqlite::Result<Option<PathBuf>> {
    Ok(db::meta(conn, CHOSEN)?.map(PathBuf::from))
}

/// Where the tracks go: the chosen folder, or the default one.
pub fn root(conn: &Connection, places: &Places) -> rusqlite::Result<PathBuf> {
    Ok(chosen(conn)?.unwrap_or_else(|| places.stems_out.clone()))
}

/// Chooses the folder (or with `None` goes back to the default one).
pub fn choose(conn: &Connection, dir: Option<&str>) -> rusqlite::Result<()> {
    db::set_meta(conn, CHOSEN, dir)
}
/// Frames written at a time.
const CHUNK: usize = 16_384;

/// The Italian file name of a separated track ("vocals" → "voce").
pub fn file_name(source: &str) -> &'static str {
    match source {
        "vocals" => "voce",
        "guitar" => "chitarra",
        "bass" => "basso",
        "drums" => "batteria",
        "piano" => "piano",
        _ => "altro",
    }
}

/// A file or folder name Windows accepts: no separators or reserved characters.
fn clean(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let clean = clean.trim().trim_end_matches('.').to_owned();
    if clean.is_empty() {
        "brano".into()
    } else {
        clean
    }
}

fn origin_of(dir: &Path) -> Option<String> {
    fs::read_to_string(dir.join(ORIGIN))
        .ok()
        .map(|text| text.trim().to_owned())
}

/// The folder for `song` inside `root`: named after the song file; the same song always gets
/// the same folder, a different song with the same name gets "(2)", "(3)"…
pub fn song_folder(root: &Path, song: &Path) -> PathBuf {
    let name = clean(&song.file_stem().unwrap_or_default().to_string_lossy());
    let wanted = song.to_string_lossy();
    let mut n = 1;
    loop {
        let dir = if n == 1 {
            root.join(&name)
        } else {
            root.join(format!("{name} ({n})"))
        };
        match origin_of(&dir) {
            None if !dir.exists() => return dir,
            Some(origin) if origin.eq_ignore_ascii_case(&wanted) => return dir,
            None if fs::read_dir(&dir).map_or(true, |mut d| d.next().is_none()) => return dir,
            _ => n += 1,
        }
    }
}

/// Writes one track as a 16-bit WAV (the cache keeps 16 bits: nothing is lost), first under a
/// temporary name, so a half-written file never looks finished.
pub fn write_track(path: &Path, pcm: &Pcm) -> io::Result<()> {
    let partial = path.with_extension("wav.partial");
    let mut wav = WavWriter::create(&partial, pcm.sample_rate(), BitDepth::Pcm16)?;
    let frames = pcm.frames() as usize;
    let mut buffer = Vec::with_capacity(CHUNK * 2);
    for start in (0..frames).step_by(CHUNK) {
        buffer.clear();
        for index in start..(start + CHUNK).min(frames) {
            buffer.extend_from_slice(&pcm.frame(index));
        }
        wav.write(&buffer)?;
    }
    wav.finish()?;
    fs::rename(&partial, path).inspect_err(|_| {
        let _ = fs::remove_file(&partial);
    })
}

/// Saves the tracks (`(source name, audio)`) of `song` into its folder under `root`; returns the
/// files written, in the given order.
pub fn save(root: &Path, song: &Path, tracks: &[(&str, Pcm)]) -> io::Result<Vec<PathBuf>> {
    let dir = song_folder(root, song);
    fs::create_dir_all(&dir)?;
    fs::write(dir.join(ORIGIN), song.to_string_lossy().as_bytes())?;
    tracks
        .iter()
        .map(|(source, pcm)| {
            let file = dir.join(format!("{}.wav", file_name(source)));
            write_track(&file, pcm).map(|()| file)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests::temp_dir;

    fn tone(frames: usize) -> Pcm {
        let mut pcm = Pcm::with_capacity(48_000, frames);
        let samples: Vec<f32> = (0..frames * 2).map(|i| (i % 7) as f32 / 10.0).collect();
        pcm.extend_from_f32(&samples);
        pcm
    }

    #[test]
    fn writes_one_wav_per_track_with_italian_names() {
        let root = temp_dir("stems-out");
        let song = root.join("01 - The 12th Hour.mp3");
        let files = save(
            &root,
            &song,
            &[("vocals", tone(40_000)), ("guitar", tone(40_000))],
        )
        .unwrap();
        let dir = root.join("01 - The 12th Hour");
        assert_eq!(files, [dir.join("voce.wav"), dir.join("chitarra.wav")]);
        // 44-byte header + 40 000 stereo frames of 16 bits
        assert_eq!(fs::metadata(&files[0]).unwrap().len(), 44 + 40_000 * 4);
        assert_eq!(origin_of(&dir).unwrap(), song.to_string_lossy());
        assert!(!dir.join("voce.wav.partial").exists());
    }

    #[test]
    fn the_same_song_reuses_its_folder_another_one_gets_its_own() {
        let root = temp_dir("stems-out-names");
        let first = root.join("a").join("Song?.mp3");
        let other = root.join("b").join("Song?.mp3");
        save(&root, &first, &[("bass", tone(10))]).unwrap();
        assert_eq!(song_folder(&root, &first), root.join("Song_"));
        assert_eq!(song_folder(&root, &other), root.join("Song_ (2)"));
        save(&root, &other, &[("bass", tone(10))]).unwrap();
        assert_eq!(song_folder(&root, &other), root.join("Song_ (2)"));
    }

    #[test]
    fn the_chosen_folder_wins_until_the_default_is_back() {
        let conn = crate::db::tests::memory();
        let places = Places::under(Path::new("D:/data"));
        assert_eq!(root(&conn, &places).unwrap(), places.stems_out);
        choose(&conn, Some("E:/Reaper/Tracce")).unwrap();
        assert_eq!(root(&conn, &places).unwrap(), Path::new("E:/Reaper/Tracce"));
        choose(&conn, None).unwrap();
        assert_eq!(root(&conn, &places).unwrap(), places.stems_out);
    }

    #[test]
    fn every_source_has_a_name() {
        let names: Vec<&str> = stem_split::SOURCES.iter().map(|s| file_name(s)).collect();
        assert_eq!(
            names,
            ["batteria", "basso", "altro", "voce", "chitarra", "piano"]
        );
    }
}
