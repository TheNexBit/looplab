//! The setlists of the gigs (see `crate::setlist`).

use tauri::State;

use super::AppError;
use crate::db::Library;
use crate::setlist::{self, Setlist, SetlistLibrary};

/// Every setlist, next gig first, and whether their files are still on the disk.
#[tauri::command]
#[specta::specta]
pub fn setlist_library(library: State<'_, Library>) -> Result<SetlistLibrary, AppError> {
    Ok(library.with(setlist::library)?)
}

/// Saves a setlist (a new one, with an empty id, gets its own); returns it as saved.
#[tauri::command]
#[specta::specta]
pub async fn save_setlist(
    library: State<'_, Library>,
    setlist: Setlist,
) -> Result<Setlist, AppError> {
    // Reading the length of new files may touch the disk: off the UI thread
    Ok(library.with(|conn| setlist::save(conn, setlist))?)
}

/// Deletes a setlist; its songs' files are not touched.
#[tauri::command]
#[specta::specta]
pub fn delete_setlist(library: State<'_, Library>, id: String) -> Result<(), AppError> {
    Ok(library.with(|conn| setlist::delete(conn, &id))?)
}
