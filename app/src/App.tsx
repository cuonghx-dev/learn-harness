import { useCallback, useEffect, useRef, useState } from "react"

import { ChatPanel } from "@/components/ChatPanel"
import { LogControl } from "@/components/LogControl"
import { NotesSidebar } from "@/components/NotesSidebar"
import { NoteViewer } from "@/components/NoteViewer"
import { api, on, type Note } from "@/lib/ipc"
import { project } from "@/lib/project"
import { useClaude } from "@/lib/useClaude"
import { cn } from "@/lib/utils"

const CHAT_WIDTH_KEY = "learn:chatWidth"
const CHAT_MIN = 320
const CHAT_MAX = 640
const SIDEBAR_WIDTH = 248

function storedWidth() {
  try {
    const w = Number(localStorage.getItem(CHAT_WIDTH_KEY))
    return w ? Math.min(Math.max(w, CHAT_MIN), CHAT_MAX) : 400
  } catch {
    return 400
  }
}

export default function App() {
  const [logFile, setLogFile] = useState<string | null>(null)
  const claude = useClaude(logFile)
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [syncedAt, setSyncedAt] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const [chatWidth, setChatWidth] = useState(storedWidth)
  const [resizing, setResizing] = useState(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const logFileRef = useRef(logFile)
  logFileRef.current = logFile
  // Changes right after starting a log are md-log's backfill, not an outside edit.
  const quietUntil = useRef(0)

  const refreshNotes = useCallback(() => api.listNotes().then(setNotes), [])
  const refreshLog = useCallback(() => api.mdlogStatus().then(setLogFile), [])

  useEffect(() => {
    api.projectDir().then(async (dir) => {
      project.dir = dir
      const [, log] = await Promise.all([refreshNotes(), api.mdlogStatus()])
      setLogFile(log)
      if (log) setSelected(log)
      setReady(true)
    })
    const onFocus = () => void refreshLog()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refreshNotes, refreshLog])

  // Load the selected note, and reload it whenever md-log (or anything) writes to it.
  useEffect(() => {
    if (!selected) return setContent("")
    api.readNote(selected).then(setContent, () => setContent(""))
  }, [selected])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let touched = new Set<string>()
    const sub = on.notesChanged((paths) => {
      paths.forEach((p) => touched.add(p))
      clearTimeout(timer)
      timer = setTimeout(() => {
        const sel = selectedRef.current
        if (sel && touched.has(sel)) {
          api.readNote(sel).then(setContent, () => {})
          if (sel !== logFileRef.current && Date.now() > quietUntil.current) setSyncedAt(Date.now())
        }
        touched = new Set()
        refreshNotes()
      }, 200)
    })
    return () => {
      clearTimeout(timer)
      sub.then((off) => off())
    }
  }, [refreshNotes])

  // ⌘B toggles the notes list, ⌘J the chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.key === "b") setSidebarOpen((v) => !v)
      else if (e.key === "j") setChatOpen((v) => !v)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const startLog = async (path: string) => {
    try {
      quietUntil.current = Date.now() + 3000
      // md-log needs the session's transcript path, which its SessionStart hook records.
      await api.claudeEnsure()
      const msg = await api.mdlogLink(path)
      if (!msg.startsWith("Linked")) throw new Error(msg)
      await Promise.all([refreshLog(), refreshNotes()])
      setSelected(path)
      claude.notice(`Bắt đầu ghi vào ${path}`)
    } catch (e) {
      claude.notice(`Không ghi log được: ${e instanceof Error ? e.message : String(e)}`, "error")
    }
  }

  const stopLog = async () => {
    try {
      quietUntil.current = Date.now() + 3000
      await api.mdlogUnlink()
      claude.notice("Đã dừng ghi log")
    } catch (e) {
      claude.notice(`Không dừng được: ${String(e)}`, "error")
    }
    await refreshLog()
  }

  const openNote = (target: string) => {
    const t = target.replace(/\.md$/, "").toLowerCase()
    const hit = notes.find((n) => n.name.toLowerCase() === t || n.path.toLowerCase().endsWith(`${t}.md`))
    if (hit) setSelected(hit.path)
  }

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = chatWidth
    let w = startW
    setResizing(true)
    const move = (ev: PointerEvent) => {
      w = Math.min(Math.max(startW + startX - ev.clientX, CHAT_MIN), CHAT_MAX)
      setChatWidth(w)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setResizing(false)
      try {
        localStorage.setItem(CHAT_WIDTH_KEY, String(w))
      } catch {
        // Width just won't persist.
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  if (!ready) return null

  const title = selected?.split("/").pop()?.replace(/\.md$/, "")
  const slide = resizing ? "" : "transition-[width] duration-[180ms] ease-out"

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="flex h-[38px] shrink-0 items-center justify-center border-b border-input bg-titlebar text-[12px] text-muted-2"
      >
        <span data-tauri-drag-region className="truncate px-24">
          {title ? `Learn — ${title}` : "Learn"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside
          aria-hidden={!sidebarOpen}
          style={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0 }}
          className={cn("shrink-0 overflow-hidden bg-sidebar", slide, sidebarOpen && "border-r border-border")}
        >
          <NotesSidebar notes={notes} selected={selected} logFile={logFile} onSelect={setSelected} />
        </aside>
        <main className="min-w-0 flex-1">
          <NoteViewer
            path={selected}
            content={content}
            live={!!logFile && logFile === selected}
            focus={!sidebarOpen && !chatOpen}
            modified={notes.find((n) => n.path === selected)?.modified}
            syncedAt={syncedAt}
            onOpenNote={openNote}
          />
        </main>
        <aside
          aria-hidden={!chatOpen}
          style={{ width: chatOpen ? chatWidth : 0 }}
          className={cn("relative shrink-0 bg-chat", slide, chatOpen && "border-l border-border")}
        >
          {chatOpen && (
            <div
              onPointerDown={startResize}
              className="group absolute inset-y-0 -left-[5px] z-10 flex w-[9px] cursor-col-resize items-center justify-center"
            >
              <span className="h-9 w-[5px] rounded-[3px] bg-[#d3cbbb] group-hover:bg-[#c9bfae]" />
            </div>
          )}
          <div className="h-full overflow-hidden">
            <div className="h-full" style={{ width: chatWidth }}>
              <ChatPanel
                claude={claude}
                logControl={<LogControl logFile={logFile} notes={notes} onStart={startLog} onStop={stopLog} />}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
