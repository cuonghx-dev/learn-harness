//! Drives `claude -p` over the stream-json protocol, the same one the Agent SDK
//! speaks to the CLI:
//!
//! - stdin  ← `{"type":"user",...}` messages, `control_response`s, `interrupt`
//! - stdout → every JSON line is forwarded to the UI as `claude://message`
//!
//! `--permission-prompt-tool stdio` makes the CLI ask *us* before running a
//! tool (`control_request` / `can_use_tool`). In the `default` permission mode
//! the CLI already allows read-only tools itself, so what reaches us is either
//! `AskUserQuestion` (rendered as a quiz card) or a tool that changes something
//! (Bash, Write, Edit, ...), rendered as a permission card. Tools the learner
//! marked "always allow" are answered here without asking again. The UI answers
//! with `claude_respond`.
//!
//! The session also gets the app's own MCP server (`resources/learn-mcp.mjs`)
//! with a `grade_quiz` tool: Claude reports quiz grading through it as
//! structured input, which the UI renders as a graded quiz card.
//!
//! One session at a time. Each spawn gets a generation number so events from a
//! process that was just replaced can be told apart by the UI.

use std::collections::HashSet;
use std::io::Read;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::{oneshot, watch, Mutex};

use crate::Project;

const QUIZ_TOOL: &str = "AskUserQuestion";
/// Served by our own MCP server; always allowed, the UI reads its input.
const GRADE_TOOL: &str = "mcp__learn__grade_quiz";
const LEARN_MCP: &str = include_str!("../resources/learn-mcp.mjs");
const SYSTEM_PROMPT: &str = "Bạn đang chạy trong app desktop Learn. Sau khi người học trả lời một quiz AskUserQuestion, \
gọi ngay mcp__learn__grade_quiz với đáp án đúng, đúng/sai và giải thích ngắn cho từng câu, rồi mới giảng tiếp. \
\"Tôi không biết\" là câu trả lời hợp lệ (tính là sai): giảng lại phần đó, đừng trách.";
const READY_TIMEOUT: Duration = Duration::from_secs(20);
const LOGIN_PATH_TIMEOUT: Duration = Duration::from_secs(3);

/// Tools the learner chose to always allow for the current session.
type Allowed = Arc<std::sync::Mutex<HashSet<String>>>;

struct Proc {
    gen: u64,
    stdin: Arc<Mutex<ChildStdin>>,
    kill: Option<oneshot::Sender<()>>,
    ready: watch::Receiver<bool>,
    allowed: Allowed,
}

impl Proc {
    fn kill(&mut self) {
        if let Some(kill) = self.kill.take() {
            let _ = kill.send(());
        }
    }
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
    /// Replace whatever runs in `slot` with a fresh process. The caller holds
    /// the `proc` lock, so a check-then-spawn can't race another spawn.
    fn spawn(&self, slot: &mut Option<Proc>, app: &AppHandle, project: &Path, resume: Option<String>) -> Result<u64, String> {
        if let Some(mut old) = slot.take() {
            old.kill();
        }

        let mcp_script = write_mcp_script(app)?;
        let mcp_config = json!({
            "mcpServers": { "learn": { "command": "node", "args": [mcp_script] } },
        });

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
            "default",
            "--append-system-prompt",
            SYSTEM_PROMPT,
        ]);
        cmd.arg("--mcp-config").arg(mcp_config.to_string());
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
        // Own process group, so stopping the session also stops the hooks and
        // MCP servers it started.
        #[cfg(unix)]
        cmd.process_group(0);

        let mut child = cmd.spawn().map_err(|e| format!("không chạy được `claude`: {e}"))?;
        let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("no stdin")?));
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;

        let gen = self.next_gen.fetch_add(1, Ordering::SeqCst) + 1;
        let (ready_tx, ready_rx) = watch::channel(false);
        let (kill_tx, kill_rx) = oneshot::channel::<()>();
        let allowed = Allowed::default();

        // stdout: forward every message; answer non-quiz permission prompts.
        let app_out = app.clone();
        let stdin_out = stdin.clone();
        let allowed_out = allowed.clone();
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

                let tool = msg["request"]["tool_name"].as_str().unwrap_or_default();
                if ty == "control_request"
                    && msg["request"]["subtype"] == "can_use_tool"
                    && tool != QUIZ_TOOL
                    && (tool == GRADE_TOOL || allowed_out.lock().is_ok_and(|a| a.contains(tool)))
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
        let pid = child.id();
        tauri::async_runtime::spawn(async move {
            let code = tokio::select! {
                status = child.wait() => status.ok().and_then(|s| s.code()),
                _ = kill_rx => {
                    #[cfg(unix)]
                    if let Some(pid) = pid {
                        // SAFETY: plain syscall; the group id is the child's pid (process_group(0)).
                        unsafe { libc::killpg(pid as libc::pid_t, libc::SIGTERM) };
                    }
                    let _ = child.kill().await;
                    None
                }
            };
            app_exit.state::<Claude>().clear(gen).await;
            let _ = app_exit.emit("claude://exit", json!({ "gen": gen, "code": code }));
        });

        *slot = Some(Proc { gen, stdin, kill: Some(kill_tx), ready: ready_rx, allowed });
        Ok(gen)
    }

    /// The running session, spawning a fresh one if none is running.
    async fn ensure(&self, app: &AppHandle, project: &Path) -> Result<(u64, Arc<Mutex<ChildStdin>>, watch::Receiver<bool>), String> {
        let mut slot = self.proc.lock().await;
        if slot.is_none() {
            self.spawn(&mut slot, app, project, None)?;
        }
        let p = slot.as_ref().ok_or("claude exited")?;
        Ok((p.gen, p.stdin.clone(), p.ready.clone()))
    }

    async fn current(&self) -> Result<(Arc<Mutex<ChildStdin>>, Allowed), String> {
        let slot = self.proc.lock().await;
        slot.as_ref().map(|p| (p.stdin.clone(), p.allowed.clone())).ok_or_else(|| "chưa có session".into())
    }

    /// Forget the process of generation `gen` once it has exited.
    async fn clear(&self, gen: u64) {
        let mut slot = self.proc.lock().await;
        if slot.as_ref().is_some_and(|p| p.gen == gen) {
            *slot = None;
        }
    }
}

/// Write the bundled MCP server where `node` can run it; returns its path.
fn write_mcp_script(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| format!("cache dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = dir.join("learn-mcp.mjs");
    if std::fs::read_to_string(&path).ok().as_deref() != Some(LEARN_MCP) {
        std::fs::write(&path, LEARN_MCP).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Start a session (replacing the current one), optionally resuming `resume`.
#[tauri::command]
pub async fn claude_start(
    app: AppHandle,
    claude: State<'_, Claude>,
    project: State<'_, Project>,
    resume: Option<String>,
) -> Result<u64, String> {
    let mut slot = claude.proc.lock().await;
    claude.spawn(&mut slot, &app, &project.0, resume)
}

/// Make sure a session is running and its SessionStart hooks have finished.
#[tauri::command]
pub async fn claude_ensure(app: AppHandle, claude: State<'_, Claude>, project: State<'_, Project>) -> Result<u64, String> {
    let (gen, _, mut ready) = claude.ensure(&app, &project.0).await?;
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
    let (gen, stdin, _) = claude.ensure(&app, &project.0).await?;
    let msg = json!({ "type": "user", "message": { "role": "user", "content": text } });
    write_line(&stdin, &msg).await?;
    Ok(gen)
}

/// Answer a `can_use_tool` request the UI was handed (a quiz or a permission
/// card). `always_allow` names a tool to allow without asking for the rest of
/// the session.
#[tauri::command]
pub async fn claude_respond(
    claude: State<'_, Claude>,
    request_id: String,
    response: Value,
    always_allow: Option<String>,
) -> Result<(), String> {
    let msg = json!({
        "type": "control_response",
        "response": { "subtype": "success", "request_id": request_id, "response": response },
    });
    let (stdin, allowed) = claude.current().await?;
    if let Some(tool) = always_allow {
        allowed.lock().map_err(|e| e.to_string())?.insert(tool);
    }
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
    let (stdin, _) = claude.current().await?;
    write_line(&stdin, &msg).await
}

#[tauri::command]
pub async fn claude_stop(claude: State<'_, Claude>) -> Result<(), String> {
    let mut slot = claude.proc.lock().await;
    if let Some(mut p) = slot.take() {
        p.kill();
    }
    Ok(())
}

/// macOS GUI apps get launchd's minimal PATH, which misses Homebrew, nvm,
/// npm-global — where `claude` and `node` live. Borrow the login shell's PATH.
///
/// The shell is interactive (`-i`, so `.zshrc` runs), which means rc files may
/// print banners or prompt escapes, or never return (tmux auto-attach): the PATH
/// is read between markers and the shell gets a few seconds at most.
pub fn inherit_login_path() {
    const MARK: &str = "__LEARN_PATH__";
    let Ok(shell) = std::env::var("SHELL") else { return };
    let Ok(mut child) = std::process::Command::new(&shell)
        .args(["-lic", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return;
    };
    let Some(mut stdout) = child.stdout.take() else { return };
    let reader = std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        out
    });
    let deadline = Instant::now() + LOGIN_PATH_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return;
            }
        }
    }
    let Ok(out) = reader.join() else { return };
    let Some(login) = out.split(MARK).nth(1).map(str::trim).filter(|p| !p.is_empty()) else { return };
    let current = std::env::var("PATH").unwrap_or_default();
    std::env::set_var("PATH", if current.is_empty() { login.to_string() } else { format!("{login}:{current}") });
}
