//! Lesson files: list/read `notes/`, watch it for changes, and drive the
//! existing md-log hook script for the Start/Stop logging button.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::Project;

const NOTES_DIR: &str = "notes";
const MD_LOG: &str = ".claude/hooks/md-log.mjs";
const MD_LOG_STATE: &str = ".claude/state/md-log.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    /// Relative to the project root, e.g. `notes/tcp-ip.md`.
    path: String,
    name: String,
    modified: u64,
}

fn rel(project: &Path, p: &Path) -> String {
    p.strip_prefix(project).unwrap_or(p).to_string_lossy().into_owned()
}

/// Resolve `path` (relative to the project) and refuse anything outside it.
fn inside(project: &Path, path: &str) -> Result<PathBuf, String> {
    let full = project.join(path);
    let canon = full.canonicalize().map_err(|e| format!("{path}: {e}"))?;
    if !canon.starts_with(project) {
        return Err(format!("{path}: outside the project"));
    }
    Ok(canon)
}

fn collect(project: &Path, dir: &Path, out: &mut Vec<Note>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(project, &path, out);
        } else if path.extension().is_some_and(|e| e == "md") {
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            let name = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            out.push(Note { path: rel(project, &path), name, modified });
        }
    }
}

#[tauri::command]
pub fn project_dir(project: State<'_, Project>) -> String {
    project.0.to_string_lossy().into_owned()
}

/// Every markdown file under `notes/`, newest first.
#[tauri::command]
pub fn list_notes(project: State<'_, Project>) -> Vec<Note> {
    let mut notes = Vec::new();
    collect(&project.0, &project.0.join(NOTES_DIR), &mut notes);
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    notes
}

#[tauri::command]
pub fn read_note(project: State<'_, Project>, path: String) -> Result<String, String> {
    std::fs::read_to_string(inside(&project.0, &path)?).map_err(|e| format!("{path}: {e}"))
}

/// The file md-log currently writes to, relative to the project, if any.
#[tauri::command]
pub fn mdlog_status(project: State<'_, Project>) -> Option<String> {
    let raw = std::fs::read_to_string(project.0.join(MD_LOG_STATE)).ok()?;
    let state: Value = serde_json::from_str(&raw).ok()?;
    let file = state["file"].as_str()?;
    Some(rel(&project.0, Path::new(file)))
}

fn run_md_log(project: &Path, args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("node")
        .arg(project.join(MD_LOG))
        .args(args)
        .current_dir(project)
        .env("CLAUDE_PROJECT_DIR", project)
        .output()
        .map_err(|e| format!("không chạy được node: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !stderr.is_empty() && stdout.is_empty() {
        return Err(stderr);
    }
    Ok(stdout)
}

/// Same as `/md-log <path>`: link the file and backfill the session.
#[tauri::command]
pub fn mdlog_link(project: State<'_, Project>, path: String) -> Result<String, String> {
    run_md_log(&project.0, &["link", &path])
}

/// Same as `/md-unlog`.
#[tauri::command]
pub fn mdlog_unlink(project: State<'_, Project>) -> Result<String, String> {
    run_md_log(&project.0, &["unlink"])
}

struct NotesWatcher(#[allow(dead_code)] notify::RecommendedWatcher);

/// Emit `notes://changed` with the touched paths whenever `notes/` changes.
pub fn watch(app: &AppHandle, project: PathBuf) -> notify::Result<()> {
    let dir = project.join(NOTES_DIR);
    let _ = std::fs::create_dir_all(&dir);
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        let paths: Vec<String> = event.paths.iter().map(|p| rel(&project, p)).collect();
        let _ = handle.emit("notes://changed", json!({ "paths": paths }));
    })?;
    watcher.watch(&dir, RecursiveMode::Recursive)?;
    app.manage(NotesWatcher(watcher));
    Ok(())
}
