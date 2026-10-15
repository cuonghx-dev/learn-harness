//! Drives `claude -p` over the stream-json protocol, the same one the Agent SDK
//! speaks to the CLI:
//!
//! - stdin  ← `{"type":"user",...}` messages, `control_response`s, `interrupt`
//! - stdout → every JSON line is forwarded to the UI as `claude://message`
//!
//! `--permission-prompt-tool stdio` makes the CLI ask *us* before running a
//! tool (`control_request` / `can_use_tool`). Everything is auto-allowed here
//! except `AskUserQuestion`, which goes to the UI so the quiz renders as a card;
//! the UI answers with `claude_respond`.
//!
//! One session at a time. Each spawn gets a generation number so events from a
//! process that was just replaced can be told apart by the UI.

use std::collections::HashSet;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::{oneshot, watch, Mutex};

use crate::Project;

const QUIZ_TOOL: &str = "AskUserQuestion";
const READY_TIMEOUT: Duration = Duration::from_secs(20);

struct Proc {
    gen: u64,
    stdin: Arc<Mutex<ChildStdin>>,
    kill: Option<oneshot::Sender<()>>,
    ready: watch::Receiver<bool>,
}

#[derive(Default)]
pub struct Claude {
    proc: Mutex<Option<Proc>>,
    next_gen: AtomicU64,
}

async fn write_line(stdin: &Mutex<ChildStdin>, msg: &Value) -> Result<(), String> {
    let mut line = msg.to_string();
    line.push('\n');
    let mut stdin = stdin.lock().await;
    stdin.write_all(line.as_bytes()).await.map_err(|e| format!("claude stdin: {e}"))?;
    stdin.flush().await.map_err(|e| format!("claude stdin: {e}"))
}

impl Claude {
    async fn spawn(&self, app: &AppHandle, project: &Path, resume: Option<String>) -> Result<u64, String> {
        let mut slot = self.proc.lock().await;
        if let Some(mut old) = slot.take() {
            if let Some(kill) = old.kill.take() {
                let _ = kill.send(());
            }
        }

        let mut cmd = Command::new("claude");
        cmd.args([
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--permission-prompt-tool",
            "stdio",
            "--permission-mode",
            "bypassPermissions",
        ]);
        if let Some(id) = &resume {
            cmd.args(["--resume", id]);
        }
        cmd.current_dir(project)
            .env("CLAUDE_PROJECT_DIR", project)
            // Launched from inside a Claude Code terminal, the child would
            // otherwise think it is a nested session.
            .env_remove("CLAUDECODE")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("không chạy được `claude`: {e}"))?;
        let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("no stdin")?));
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;

        let gen = self.next_gen.fetch_add(1, Ordering::SeqCst) + 1;
        let (ready_tx, ready_rx) = watch::channel(false);
        let (kill_tx, kill_rx) = oneshot::channel::<()>();

        // stdout: forward every message; answer non-quiz permission prompts.
        let app_out = app.clone();
        let stdin_out = stdin.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            // SessionStart hooks (md-log `session` among them) record the
            // transcript path; the session is "ready" once they have all run.
            let mut pending_hooks: HashSet<String> = HashSet::new();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
                let ty = msg["type"].as_str().unwrap_or_default();
                let subtype = msg["subtype"].as_str().unwrap_or_default();

                if ty == "system" && msg["hook_event"] == "SessionStart" {
                    let id = msg["hook_id"].as_str().unwrap_or_default().to_string();
                    match subtype {
                        "hook_started" => {
                            pending_hooks.insert(id);
                        }
                        "hook_response" => {
                            pending_hooks.remove(&id);
                            if pending_hooks.is_empty() {
                                let _ = ready_tx.send(true);
                            }
                        }
                        _ => {}
                    }
                }
                if ty == "system" && subtype == "init" {
                    let _ = ready_tx.send(true);
                }

                if ty == "control_request"
                    && msg["request"]["subtype"] == "can_use_tool"
                    && msg["request"]["tool_name"] != QUIZ_TOOL
                {
                    let reply = json!({
                        "type": "control_response",
                        "response": {
                            "subtype": "success",
                            "request_id": msg["request_id"],
                            "response": { "behavior": "allow", "updatedInput": msg["request"]["input"] },
                        },
                    });
                    let _ = write_line(&stdin_out, &reply).await;
                    continue;
                }

                let _ = app_out.emit("claude://message", json!({ "gen": gen, "msg": msg }));
            }
        });

        let app_err = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit("claude://stderr", json!({ "gen": gen, "line": line }));
            }
        });

        let app_exit = app.clone();
        tauri::async_runtime::spawn(async move {
            let code = tokio::select! {
                status = child.wait() => status.ok().and_then(|s| s.code()),
                _ = kill_rx => {
                    let _ = child.kill().await;
                    None
                }
            };
            app_exit.state::<Claude>().clear(gen).await;
            let _ = app_exit.emit("claude://exit", json!({ "gen": gen, "code": code }));
        });

        *slot = Some(Proc { gen, stdin, kill: Some(kill_tx), ready: ready_rx });
        Ok(gen)
    }

    /// The running session's stdin, spawning a fresh session if none is running.
    async fn ensure(&self, app: &AppHandle, project: &Path) -> Result<(u64, Arc<Mutex<ChildStdin>>), String> {
        {
            let slot = self.proc.lock().await;
            if let Some(p) = slot.as_ref() {
                return Ok((p.gen, p.stdin.clone()));
            }
        }
        self.spawn(app, project, None).await?;
        let slot = self.proc.lock().await;
        let p = slot.as_ref().ok_or("claude exited")?;
        Ok((p.gen, p.stdin.clone()))
    }

    async fn stdin(&self) -> Result<Arc<Mutex<ChildStdin>>, String> {
        let slot = self.proc.lock().await;
        slot.as_ref().map(|p| p.stdin.clone()).ok_or_else(|| "chưa có session".into())
    }

    /// Forget the process of generation `gen` once it has exited.
    async fn clear(&self, gen: u64) {
        let mut slot = self.proc.lock().await;
        if slot.as_ref().is_some_and(|p| p.gen == gen) {
            *slot = None;
        }
    }
}

/// Start a session (replacing the current one), optionally resuming `resume`.
#[tauri::command]
pub async fn claude_start(
    app: AppHandle,
    claude: State<'_, Claude>,
    project: State<'_, Project>,
    resume: Option<String>,
) -> Result<u64, String> {
    claude.spawn(&app, &project.0, resume).await
}

/// Make sure a session is running and its SessionStart hooks have finished.
#[tauri::command]
pub async fn claude_ensure(app: AppHandle, claude: State<'_, Claude>, project: State<'_, Project>) -> Result<u64, String> {
    let (gen, _) = claude.ensure(&app, &project.0).await?;
    let mut ready = {
        let slot = claude.proc.lock().await;
        slot.as_ref().map(|p| p.ready.clone()).ok_or("claude exited")?
    };
    let _ = tokio::time::timeout(READY_TIMEOUT, ready.wait_for(|r| *r)).await;
    Ok(gen)
}

#[tauri::command]
pub async fn claude_send(
    app: AppHandle,
    claude: State<'_, Claude>,
    project: State<'_, Project>,
    text: String,
) -> Result<u64, String> {
    let (gen, stdin) = claude.ensure(&app, &project.0).await?;
    let msg = json!({ "type": "user", "message": { "role": "user", "content": text } });
    write_line(&stdin, &msg).await?;
    Ok(gen)
}

/// Answer a `can_use_tool` request the UI was handed (the quiz).
#[tauri::command]
pub async fn claude_respond(claude: State<'_, Claude>, request_id: String, response: Value) -> Result<(), String> {
    let msg = json!({
        "type": "control_response",
        "response": { "subtype": "success", "request_id": request_id, "response": response },
    });
    let stdin = claude.stdin().await?;
    write_line(&stdin, &msg).await
}

/// Stop the current turn; the session stays alive.
#[tauri::command]
pub async fn claude_interrupt(claude: State<'_, Claude>) -> Result<(), String> {
    let msg = json!({
        "type": "control_request",
        "request_id": uuid::Uuid::new_v4().to_string(),
        "request": { "subtype": "interrupt" },
    });
    let stdin = claude.stdin().await?;
    write_line(&stdin, &msg).await
}

#[tauri::command]
pub async fn claude_stop(claude: State<'_, Claude>) -> Result<(), String> {
    let mut slot = claude.proc.lock().await;
    if let Some(mut p) = slot.take() {
        if let Some(kill) = p.kill.take() {
            let _ = kill.send(());
        }
    }
    Ok(())
}

/// macOS GUI apps get launchd's minimal PATH, which misses Homebrew, nvm,
/// npm-global — where `claude` and `node` live. Borrow the login shell's PATH.
pub fn inherit_login_path() {
    let Ok(shell) = std::env::var("SHELL") else { return };
    let Ok(out) = std::process::Command::new(&shell).args(["-lic", "printf '%s' \"$PATH\""]).output() else {
        return;
    };
    if !out.status.success() {
        return;
    }
    let login = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if login.is_empty() {
        return;
    }
    let current = std::env::var("PATH").unwrap_or_default();
    std::env::set_var("PATH", if current.is_empty() { login } else { format!("{login}:{current}") });
}
