mod claude;
mod files;

use std::path::PathBuf;

/// The learn repo root: where `.claude/`, `notes/` and `viz/` live.
pub struct Project(pub PathBuf);

fn project_dir() -> PathBuf {
    let dir = std::env::var("LEARN_DIR")
        .map(PathBuf::from)
        // The app lives in `<repo>/app/src-tauri`.
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."));
    dir.canonicalize().unwrap_or(dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    claude::inherit_login_path();
    let project = project_dir();
    tauri::Builder::default()
        .manage(Project(project.clone()))
        .manage(claude::Claude::default())
        .setup(move |app| {
            files::watch(app.handle(), project)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            claude::claude_start,
            claude::claude_ensure,
            claude::claude_send,
            claude::claude_respond,
            claude::claude_interrupt,
            claude::claude_stop,
            files::project_dir,
            files::list_notes,
            files::read_note,
            files::mdlog_status,
            files::mdlog_link,
            files::mdlog_unlink,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
