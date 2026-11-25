//! "Export tracks": the separated tracks of a song saved as WAV files, ready for a DAW, in one
//! place — by default `Documents\Looplab\Tracce separate\<song>\voce.wav`, `chitarra.wav`… (in
//! English `Separated stems\<song>\vocals.wav`, unless the Italian folder already exists),
//! or a folder the user chose (kept in the library) — and never in the cache, which empties
//! itself. Each song folder has an `origine.txt` (`origin.txt` in English) naming the song file it came from, so two
//! songs with the same name never overwrite each other.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use audio_engine::Pcm;
use audio_engine::wav::{BitDepth, WavWriter};
use rusqlite::Connection;

use crate::db::{self, LibraryError};
use crate::paths::Places;
use crate::prefs::{self, UiLanguage};

/// Names the song file a folder came from: Italian name first (older exports), then English.
const ORIGINS: [&str; 2] = ["origine.txt", "origin.txt"];

/// The origin file written in `language`'s folder.
fn origin_name(language: UiLanguage) -> &'static str {
    match language {
        UiLanguage::Italian => ORIGINS[0],
        UiLanguage::English => ORIGINS[1],
    }
}
/// The folder chosen by the user, in the library's `meta` table.
const CHOSEN: &str = "stems_out_dir";

/// The folder chosen by the user, if any.
pub fn chosen(conn: &Connection) -> rusqlite::Result<Option<PathBuf>> {
    Ok(db::meta(conn, CHOSEN)?.map(PathBuf::from))
}

/// English name of the default folder, beside the Italian one in `Places::stems_out`.
const ENGLISH_FOLDER: &str = "Separated stems";

/// The default folder in `language`: an Italian folder that already holds tracks is kept, so
/// switching the language never splits the exports in two places.
pub fn default_root(places: &Places, language: UiLanguage) -> PathBuf {
    if language == UiLanguage::English && !places.stems_out.exists() {
        places.stems_out.with_file_name(ENGLISH_FOLDER)
    } else {
        places.stems_out.clone()
    }
}

/// Where the tracks go: the chosen folder, or the default one.
pub fn root(conn: &Connection, places: &Places) -> Result<PathBuf, LibraryError> {
    Ok(match chosen(conn)? {
        Some(dir) => dir,
        None => default_root(places, prefs::language(conn)?),
    })
}

/// Chooses the folder (or with `None` goes back to the default one).
pub fn choose(conn: &Connection, dir: Option<&str>) -> rusqlite::Result<()> {
    db::set_meta(conn, CHOSEN, dir)
}
/// Frames written at a time.
const CHUNK: usize = 16_384;

/// The file name of a separated track: the source's own name in English ("vocals"), the
/// Italian word otherwise ("voce").
pub fn file_name(source: &str, language: UiLanguage) -> &str {
    if language == UiLanguage::English {
        return source;
    }
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
    ORIGINS
        .iter()
        .find_map(|name| fs::read_to_string(dir.join(name)).ok())
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

/// Removes `path` if it exists; a file that is not there is no error.
fn remove_if_there(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(err) if err.kind() != io::ErrorKind::NotFound => Err(err),
        _ => Ok(()),
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
pub fn save(
    root: &Path,
    song: &Path,
    tracks: &[(&str, Pcm)],
    language: UiLanguage,
) -> io::Result<Vec<PathBuf>> {
    let dir = song_folder(root, song);
    fs::create_dir_all(&dir)?;
    // Exported before in the other language: only the files we wrote then go, never others
    let other = match language {
        UiLanguage::Italian => UiLanguage::English,
        UiLanguage::English => UiLanguage::Italian,
    };
    for (source, _) in tracks {
        let old = file_name(source, other);
        if old != file_name(source, language) {
            remove_if_there(&dir.join(format!("{old}.wav")))?;
        }
    }
    remove_if_there(&dir.join(origin_name(other)))?;
    fs::write(
        dir.join(origin_name(language)),
        song.to_string_lossy().as_bytes(),
    )?;
    tracks
        .iter()
        .map(|(source, pcm)| {
            let file = dir.join(format!("{}.wav", file_name(source, language)));
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
            UiLanguage::Italian,
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
    fn english_exports_name_their_origin_file_in_english_and_still_find_old_folders() {
        let root = temp_dir("stems-out-origin");
        let song = root.join("Song.mp3");
        save(&root, &song, &[("bass", tone(10))], UiLanguage::English).unwrap();
        let dir = root.join("Song");
        assert!(dir.join("origin.txt").is_file() && !dir.join("origine.txt").exists());
        assert!(dir.join("bass.wav").is_file());
        // The same song again, now in Italian: the folder is found by its English origin file
        assert_eq!(song_folder(&root, &song), dir);
        // …and holds only the Italian files afterwards, with a user's own file left alone
        fs::write(dir.join("mix.wav"), b"mine").unwrap();
        save(&root, &song, &[("bass", tone(10))], UiLanguage::Italian).unwrap();
        assert!(dir.join("basso.wav").is_file() && dir.join("origine.txt").is_file());
        assert!(!dir.join("bass.wav").exists() && !dir.join("origin.txt").exists());
        assert!(dir.join("mix.wav").is_file());
    }

    #[test]
    fn the_same_song_reuses_its_folder_another_one_gets_its_own() {
        let root = temp_dir("stems-out-names");
        let first = root.join("a").join("Song?.mp3");
        let other = root.join("b").join("Song?.mp3");
        save(&root, &first, &[("bass", tone(10))], UiLanguage::Italian).unwrap();
        assert_eq!(song_folder(&root, &first), root.join("Song_"));
        assert_eq!(song_folder(&root, &other), root.join("Song_ (2)"));
        save(&root, &other, &[("bass", tone(10))], UiLanguage::Italian).unwrap();
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
        let names: Vec<&str> = stem_split::SOURCES
            .iter()
            .map(|s| file_name(s, UiLanguage::Italian))
            .collect();
        assert_eq!(
            names,
            ["batteria", "basso", "altro", "voce", "chitarra", "piano"]
        );
        let names: Vec<&str> = stem_split::SOURCES
            .iter()
            .map(|s| file_name(s, UiLanguage::English))
            .collect();
        assert_eq!(
            names,
            ["drums", "bass", "other", "vocals", "guitar", "piano"]
        );
    }

    #[test]
    fn the_default_folder_follows_the_language_but_keeps_an_italian_one() {
        let conn = crate::db::tests::memory();
        let data = temp_dir("stems-out-language");
        let places = Places::under(&data);
        assert_eq!(root(&conn, &places).unwrap(), places.stems_out);
        prefs::set(&conn, "looplab.settings", Some(r#"{"language":"en"}"#)).unwrap();
        assert_eq!(root(&conn, &places).unwrap(), data.join("Separated stems"));
        fs::create_dir_all(&places.stems_out).unwrap();
        assert_eq!(root(&conn, &places).unwrap(), places.stems_out);
    }
}
