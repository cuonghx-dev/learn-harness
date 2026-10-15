import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export type Note = { path: string; name: string; modified: number }

// The CLI's stream-json messages are loosely typed; the chat reducer narrows them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClaudeMessage = Record<string, any>

export const api = {
  projectDir: () => invoke<string>("project_dir"),
  listNotes: () => invoke<Note[]>("list_notes"),
  readNote: (path: string) => invoke<string>("read_note", { path }),

  mdlogStatus: () => invoke<string | null>("mdlog_status"),
  mdlogLink: (path: string) => invoke<string>("mdlog_link", { path }),
  mdlogUnlink: () => invoke<string>("mdlog_unlink"),

  claudeStart: (resume?: string) => invoke<number>("claude_start", { resume: resume ?? null }),
  claudeEnsure: () => invoke<number>("claude_ensure"),
  claudeSend: (text: string) => invoke<number>("claude_send", { text }),
  claudeRespond: (requestId: string, response: unknown) => invoke<void>("claude_respond", { requestId, response }),
  claudeInterrupt: () => invoke<void>("claude_interrupt"),
  claudeStop: () => invoke<void>("claude_stop"),
}

export const on = {
  message: (cb: (p: { gen: number; msg: ClaudeMessage }) => void): Promise<UnlistenFn> =>
    listen<{ gen: number; msg: ClaudeMessage }>("claude://message", (e) => cb(e.payload)),
  stderr: (cb: (p: { gen: number; line: string }) => void): Promise<UnlistenFn> =>
    listen<{ gen: number; line: string }>("claude://stderr", (e) => cb(e.payload)),
  exit: (cb: (p: { gen: number; code: number | null }) => void): Promise<UnlistenFn> =>
    listen<{ gen: number; code: number | null }>("claude://exit", (e) => cb(e.payload)),
  notesChanged: (cb: (paths: string[]) => void): Promise<UnlistenFn> =>
    listen<{ paths: string[] }>("notes://changed", (e) => cb(e.payload.paths)),
}

/** URL the webview can load for a file inside the project. */
export function fileUrl(projectDir: string, relPath: string): string {
  const abs = relPath.startsWith("/") ? relPath : `${projectDir}/${relPath}`
  return convertFileSrc(abs)
}
