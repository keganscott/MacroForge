//! Saving and loading the user's data: one JSON file, written atomically
//! (temp file, then rename), with the previous good copy kept as `.bak`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::model::Data;

pub const FILE: &str = "macroforge.json";
const MAX_BYTES: u64 = 32 * 1024 * 1024;

pub struct Loaded {
    pub data: Data,
    /// Something was wrong with the file (and what was done about it).
    pub warning: Option<String>,
}

pub fn load(dir: &Path) -> Loaded {
    let path = dir.join(FILE);
    match read(&path) {
        Ok(Some(mut data)) => {
            let dropped = data.sanitize();
            let warning = (dropped > 0).then(|| format!("{dropped} item(s) in your saved data could not be used and were left out."));
            Loaded { data, warning }
        }
        Ok(None) => Loaded { data: Data::default(), warning: None },
        Err(e) => {
            // Keep the unreadable file for the user, try the backup.
            let keep = path.with_extension("json.broken");
            let _ = fs::rename(&path, &keep);
            match read(&path.with_extension("json.bak")) {
                Ok(Some(mut data)) => {
                    data.sanitize();
                    Loaded { data, warning: Some(format!("Your saved data could not be read ({e}); the last backup was loaded. The unreadable file was kept as {}.", keep.display())) }
                }
                _ => Loaded {
                    data: Data::default(),
                    warning: Some(format!("Your saved data could not be read ({e}). It was kept as {}.", keep.display())),
                },
            }
        }
    }
}

fn read(path: &Path) -> Result<Option<Data>, String> {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if meta.len() > MAX_BYTES {
        return Err("file is too large".into());
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map(Some).map_err(|e| e.to_string())
}

pub fn save(dir: &Path, data: &Data) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(FILE);
    let tmp = dir.join(format!("{FILE}.tmp"));
    let json = serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?;
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(&json).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// `%APPDATA%\MacroForge`.
pub fn default_dir() -> PathBuf {
    std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join("MacroForge")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("macroforge-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn save_then_load() {
        let dir = tmpdir("rt");
        let mut d = Data::default();
        d.settings.sounds = false;
        save(&dir, &d).unwrap();
        save(&dir, &d).unwrap();
        let l = load(&dir);
        assert!(l.warning.is_none());
        assert_eq!(l.data, d);
        assert!(dir.join("macroforge.json.bak").exists());
    }

    #[test]
    fn corrupt_file_falls_back_to_backup() {
        let dir = tmpdir("bad");
        let mut d = Data::default();
        d.settings.hud = false;
        save(&dir, &d).unwrap();
        save(&dir, &d).unwrap();
        fs::write(dir.join(FILE), "{ nope").unwrap();
        let l = load(&dir);
        assert!(l.warning.unwrap().contains("backup"));
        assert!(!l.data.settings.hud);
        assert!(dir.join("macroforge.json.broken").exists());
    }

    #[test]
    fn missing_file_is_defaults() {
        let l = load(&tmpdir("none"));
        assert!(l.warning.is_none());
        assert_eq!(l.data, Data::default());
    }
}
