//! The UI's preferences (settings, shortcuts, metronome library and exercises, look…), kept in
//! the library so they are backed up with everything else. Each one is a JSON value under the
//! key the UI gives it; the UI reads them all once at start.

use std::collections::BTreeMap;

use rusqlite::{Connection, params};

use crate::db::{self, LibraryError};

/// Set once the preferences of the WebView's local storage (older versions) were imported.
const IMPORTED: &str = "prefs_imported";

/// Every preference, as JSON text by key; and whether the old ones were already imported.
pub fn all(conn: &Connection) -> Result<(BTreeMap<String, String>, bool), LibraryError> {
    let mut query = conn.prepare("SELECT key, value FROM prefs")?;
    let values = query
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok((values, db::meta(conn, IMPORTED)?.is_some()))
}

/// Saves one preference, or removes it with `None`.
pub fn set(conn: &Connection, key: &str, value: Option<&str>) -> Result<(), LibraryError> {
    match value {
        Some(value) => {
            serde_json::from_str::<serde_json::Value>(value)?;
            conn.execute(
                "INSERT INTO prefs (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?
        }
        None => conn.execute("DELETE FROM prefs WHERE key = ?1", [key])?,
    };
    Ok(())
}

/// Imports the preferences an older version kept in the WebView, once: a value already in the
/// library wins. Values that are not JSON are skipped.
pub fn import(conn: &Connection, values: &BTreeMap<String, String>) -> Result<(), LibraryError> {
    let tx = conn.unchecked_transaction()?;
    if db::meta(&tx, IMPORTED)?.is_none() {
        for (key, value) in values {
            if serde_json::from_str::<serde_json::Value>(value).is_ok() {
                tx.execute(
                    "INSERT OR IGNORE INTO prefs (key, value) VALUES (?1, ?2)",
                    params![key, value],
                )?;
            }
        }
        db::set_meta(&tx, IMPORTED, Some("1"))?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::memory;

    #[test]
    fn saves_replaces_and_removes() {
        let conn = memory();
        set(&conn, "a", Some("1")).unwrap();
        set(&conn, "a", Some(r#"{"x":2}"#)).unwrap();
        set(&conn, "b", Some("true")).unwrap();
        set(&conn, "b", None).unwrap();
        let (values, imported) = all(&conn).unwrap();
        assert_eq!(values.len(), 1);
        assert_eq!(values["a"], r#"{"x":2}"#);
        assert!(!imported);
        assert!(set(&conn, "c", Some("{ not json")).is_err());
    }

    #[test]
    fn imports_the_old_ones_once_without_overwriting() {
        let conn = memory();
        set(&conn, "kept", Some("1")).unwrap();
        let old = BTreeMap::from([
            ("kept".to_owned(), "2".to_owned()),
            ("new".to_owned(), "3".to_owned()),
            ("broken".to_owned(), "{".to_owned()),
        ]);
        import(&conn, &old).unwrap();
        import(
            &conn,
            &BTreeMap::from([("late".to_owned(), "4".to_owned())]),
        )
        .unwrap();
        let (values, imported) = all(&conn).unwrap();
        assert!(imported);
        assert_eq!(values["kept"], "1");
        assert_eq!(values["new"], "3");
        assert!(!values.contains_key("broken") && !values.contains_key("late"));
    }
}
