//! Small JSON files: the window places this PC keeps, and the files of older versions read
//! once to import them into the library.
//!
//! Every write is atomic (temporary file + rename): a crash or power cut never leaves
//! a half-written file behind.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde::de::DeserializeOwned;

/// The file's content, or the default when it is missing or damaged.
pub fn read_or_default<T: DeserializeOwned + Default>(path: &Path) -> T {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Saves `value` as readable JSON, creating the folder if needed.
pub fn write<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(value).map_err(io::Error::other)?;
    write_atomically(path, &json)
}

/// Writes `contents` to a temporary file beside `path`, then swaps it in.
pub fn write_atomically(path: &Path, contents: &str) -> io::Result<()> {
    let mut temporary = path.as_os_str().to_os_string();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    fs::write(&temporary, contents)?;
    // On Windows `rename` replaces the destination in one step
    fs::rename(&temporary, path).inspect_err(|_| {
        let _ = fs::remove_file(&temporary);
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn writes_into_a_new_folder_and_reads_back() {
        let file = temp_dir("json-file").join("nested").join("data.json");
        let value = HashMap::from([("a".to_owned(), 1)]);
        write(&file, &value).unwrap();
        assert_eq!(read_or_default::<HashMap<String, i32>>(&file), value);
        assert!(!file.with_extension("json.tmp").exists());
    }

    #[test]
    fn missing_or_damaged_files_give_the_default() {
        let dir = temp_dir("json-file-broken");
        assert!(read_or_default::<Vec<i32>>(&dir.join("missing.json")).is_empty());
        fs::write(dir.join("broken.json"), "{ nope").unwrap();
        assert!(read_or_default::<Vec<i32>>(&dir.join("broken.json")).is_empty());
    }
}
