//! FFmpeg as a sidecar: extracting audio symphonia cannot read (e.g. Opus) and making
//! H.264 proxies of videos WebView2 cannot play (e.g. HEVC, MKV).
//!
//! FFmpeg is optional: without it these two features report a clear error and
//! everything else keeps working. `scripts/05-fetch-ffmpeg.cmd` installs it.

use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

use crate::hash::fnv1a;

/// Name the Tauri bundle gives the sidecar next to the app executable.
const BUNDLED_NAME: &str = "ffmpeg.exe";
/// Windows: run without flashing a console window.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Proxies stay light: at most 720 lines, a keyframe every second for instant seeks.
const PROXY_FILTER: &str = "scale=-2:'min(720,ih)'";

#[derive(Debug)]
pub enum MediaError {
    /// FFmpeg is not installed (run scripts/05-fetch-ffmpeg.cmd)
    Missing,
    /// FFmpeg ran but failed; the text is the end of its log
    Failed(String),
    Io(std::io::Error),
}

impl std::fmt::Display for MediaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Missing => f.write_str("FFmpeg is not installed"),
            Self::Failed(log) => write!(f, "FFmpeg failed: {log}"),
            Self::Io(err) => write!(f, "FFmpeg error: {err}"),
        }
    }
}

impl From<std::io::Error> for MediaError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// The FFmpeg executable: next to the app when installed, in `src-tauri/binaries` in development.
pub fn ffmpeg() -> Option<PathBuf> {
    let bundled = std::env::current_exe().ok()?.with_file_name(BUNDLED_NAME);
    if bundled.is_file() {
        return Some(bundled);
    }
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/ffmpeg-x86_64-pc-windows-msvc.exe");
        if dev.is_file() {
            return Some(dev);
        }
    }
    None
}

/// Cache file for `source`, named after its path, size and date: a changed file gets a new one.
fn cache_file(
    cache_dir: &Path,
    kind: &str,
    source: &Path,
    extension: &str,
) -> std::io::Result<PathBuf> {
    let meta = fs::metadata(source)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok());
    let key = format!(
        "{}|{}|{}",
        source.to_string_lossy().to_lowercase(),
        meta.len(),
        modified.map_or(0, |d| d.as_secs())
    );
    let dir = cache_dir.join(kind);
    fs::create_dir_all(&dir)?;
    Ok(dir.join(format!("{:016x}.{extension}", fnv1a(key.as_bytes()))))
}

/// Reads "Duration: 00:03:21.45" from FFmpeg's log, in seconds.
fn parse_duration(line: &str) -> Option<f64> {
    let rest = line.trim_start().strip_prefix("Duration: ")?;
    let clock = rest.split(',').next()?;
    let mut parts = clock.split(':').map(|p| p.trim().parse::<f64>().ok());
    let (h, m, s) = (parts.next()??, parts.next()??, parts.next()??);
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Reads "out_time_us=12345678" from `-progress` output, in seconds.
fn parse_progress(line: &str) -> Option<f64> {
    let micros: f64 = line.strip_prefix("out_time_us=")?.trim().parse().ok()?;
    Some(micros / 1_000_000.0)
}

/// Lines of FFmpeg's log quoted in an error message.
const LOG_TAIL: usize = 4;

/// Runs FFmpeg with `args`, writing to a temporary file renamed to `output` on success.
/// `progress` receives 0..1 while it works.
fn run(
    input: &Path,
    output: &Path,
    args: &[&str],
    mut progress: impl FnMut(f32),
) -> Result<(), MediaError> {
    let ffmpeg = ffmpeg().ok_or(MediaError::Missing)?;
    let partial = output.with_extension(format!(
        "partial.{}",
        output.extension().and_then(|e| e.to_str()).unwrap_or("tmp")
    ));

    let mut command = Command::new(ffmpeg);
    command
        .args(["-hide_banner", "-nostdin", "-y", "-i"])
        .arg(input)
        .args(args)
        .args(["-progress", "pipe:1", "-nostats"])
        .arg(&partial)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, CREATE_NO_WINDOW);
    let mut child = command.spawn()?;

    // The log (stderr) is read on its own thread: it carries the duration, and an unread
    // pipe would block FFmpeg once full
    let duration = Arc::new(Mutex::new(None::<f64>));
    // Only the end of the log is quoted on failure, so only the end is kept
    let log = Arc::new(Mutex::new(VecDeque::<String>::with_capacity(LOG_TAIL)));
    let stderr = child.stderr.take().map(|pipe| {
        let (duration, log) = (Arc::clone(&duration), Arc::clone(&log));
        std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                if let Some(seconds) = parse_duration(&line) {
                    *duration.lock().unwrap_or_else(|p| p.into_inner()) = Some(seconds);
                }
                let mut log = log.lock().unwrap_or_else(|p| p.into_inner());
                if log.len() == LOG_TAIL {
                    log.pop_front();
                }
                log.push_back(line);
            }
        })
    });

    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let total = *duration.lock().unwrap_or_else(|p| p.into_inner());
            if let (Some(done), Some(total)) = (parse_progress(&line), total.filter(|t| *t > 0.0)) {
                progress((done / total).clamp(0.0, 1.0) as f32);
            }
        }
    }
    let status = child.wait()?;
    if let Some(thread) = stderr {
        let _ = thread.join();
    }

    if !status.success() {
        let _ = fs::remove_file(&partial);
        let log = log.lock().unwrap_or_else(|p| p.into_inner());
        let tail: String = log
            .iter()
            .rev()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" | ");
        return Err(MediaError::Failed(tail));
    }
    fs::rename(&partial, output)?;
    progress(1.0);
    Ok(())
}

/// The audio of `source` as a FLAC file in the cache, extracted by FFmpeg (reused if present).
pub fn extract_audio(
    cache_dir: &Path,
    source: &Path,
    progress: impl FnMut(f32),
) -> Result<PathBuf, MediaError> {
    let output = cache_file(cache_dir, "audio", source, "flac")?;
    if !output.is_file() {
        run(
            source,
            &output,
            &["-vn", "-map", "0:a:0", "-ac", "2", "-c:a", "flac"],
            progress,
        )?;
    }
    Ok(output)
}

/// H.264 encoders usable in an LGPL build, best first (libx264 is GPL and never present).
const H264_ENCODERS: [&str; 2] = ["libopenh264", "h264_mf"];

/// First H.264 encoder this FFmpeg offers, asked once.
fn h264_encoder() -> Result<&'static str, MediaError> {
    static FOUND: OnceLock<Option<&'static str>> = OnceLock::new();
    let found = FOUND.get_or_init(|| {
        let ffmpeg = ffmpeg()?;
        let mut command = Command::new(ffmpeg);
        command
            .args(["-hide_banner", "-encoders"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        std::os::windows::process::CommandExt::creation_flags(&mut command, CREATE_NO_WINDOW);
        let mut list = String::new();
        command
            .spawn()
            .ok()?
            .stdout?
            .read_to_string(&mut list)
            .ok()?;
        H264_ENCODERS
            .into_iter()
            .find(|name| list.split_whitespace().any(|word| word == *name))
    });
    match found {
        Some(name) => Ok(name),
        None if ffmpeg().is_none() => Err(MediaError::Missing),
        None => Err(MediaError::Failed(
            "no LGPL H.264 encoder in this FFmpeg build".into(),
        )),
    }
}

/// A silent H.264 copy of `source` that WebView2 can always play (reused if present).
pub fn make_proxy(
    cache_dir: &Path,
    source: &Path,
    progress: impl FnMut(f32),
) -> Result<PathBuf, MediaError> {
    let output = cache_file(cache_dir, "video", source, "mp4")?;
    if !output.is_file() {
        let encoder = h264_encoder()?;
        run(
            source,
            &output,
            &[
                "-an",
                "-map",
                "0:v:0",
                "-vf",
                PROXY_FILTER,
                "-c:v",
                encoder,
                "-b:v",
                "2500k",
                "-g",
                "30",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
            ],
            progress,
        )?;
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn reads_the_duration_from_the_log() {
        assert_eq!(
            parse_duration("  Duration: 00:03:21.50, start: 0.000000, bitrate: 320 kb/s"),
            Some(201.5)
        );
        assert_eq!(parse_duration("  Stream #0:0: Audio: mp3"), None);
    }

    #[test]
    fn reads_progress_lines() {
        assert_eq!(parse_progress("out_time_us=1500000"), Some(1.5));
        assert_eq!(parse_progress("speed=2.5x"), None);
        assert_eq!(parse_progress("out_time_us=N/A"), None);
    }

    #[test]
    fn cache_names_change_with_the_file() {
        let dir = temp_dir("media-cache");
        let source = dir.join("clip.webm");
        fs::write(&source, b"one").unwrap();
        let first = cache_file(&dir, "video", &source, "mp4").unwrap();
        assert_eq!(first, cache_file(&dir, "video", &source, "mp4").unwrap());
        fs::write(&source, b"longer content").unwrap();
        assert_ne!(first, cache_file(&dir, "video", &source, "mp4").unwrap());
    }
}
