//! Helpers shared by the parity tests: the reference values in `tests/golden`.

use std::path::PathBuf;

pub fn golden_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/golden")
        .join(name)
}

/// A golden file of little-endian `f32` values.
pub fn golden(name: &str) -> Vec<f32> {
    let path = golden_path(name);
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}
