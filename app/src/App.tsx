import { useCallback, useEffect, useRef, useState } from "react"
import { PanelLeft, PanelRight } from "lucide-react"

import { ChatPanel } from "@/components/ChatPanel"
import { LogControl } from "@/components/LogControl"
import { NotesSidebar } from "@/components/NotesSidebar"
import { NoteViewer } from "@/components/NoteViewer"
import { TipButton } from "@/components/TipButton"
import { api, on, type Note } from "@/lib/ipc"
import { project } from "@/lib/project"
import { useClaude } from "@/lib/useClaude"
import { cn } from "@/lib/utils"

const CHAT_WIDTH_KEY = "learn:chatWidth"

function storedWidth() {
  try {
    return Number(localStorage.getItem(CHAT_WIDTH_KEY)) || 460
  } catch {
    return 460
  }
}

export default function App() {
  const claude = useClaude()
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [logFile, setLogFile] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const [chatWidth, setChatWidth] = useState(storedWidth)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

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
        if (sel && touched.has(sel)) api.readNote(sel).then(setContent, () => {})
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
    const move = (ev: PointerEvent) => {
      w = Math.min(Math.max(startW + startX - ev.clientX, 340), 900)
      setChatWidth(w)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
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

  const toolbar = (
    <div className={cn("flex shrink-0 items-center gap-0.5", !sidebarOpen && "pl-[68px]")}>
      <TipButton variant="ghost" size="icon" className="size-7 text-muted-foreground" tip="Danh sách bài (⌘B)" onClick={() => setSidebarOpen((v) => !v)}>
        <PanelLeft />
      </TipButton>
      {!chatOpen && (
        <TipButton variant="ghost" size="icon" className="size-7 text-muted-foreground" tip="Trò chuyện (⌘J)" onClick={() => setChatOpen(true)}>
          <PanelRight />
        </TipButton>
      )}
    </div>
  )

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <aside className="w-64 shrink-0 border-r">
          <NotesSidebar notes={notes} selected={selected} logFile={logFile} onSelect={setSelected} />
        </aside>
      )}
      <main className="min-w-0 flex-1">
        <NoteViewer path={selected} content={content} live={!!logFile && logFile === selected} toolbar={toolbar} onOpenNote={openNote} />
      </main>
      {chatOpen && (
        <aside className="relative shrink-0 border-l" style={{ width: chatWidth }}>
          <div onPointerDown={startResize} className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-primary/20" />
          <ChatPanel
            claude={claude}
            header={
              <>
                <TipButton variant="ghost" size="icon" className="size-7 text-muted-foreground" tip="Ẩn (⌘J)" onClick={() => setChatOpen(false)}>
                  <PanelRight />
                </TipButton>
                <LogControl logFile={logFile} notes={notes} onStart={startLog} onStop={stopLog} />
              </>
            }
          />
        </aside>
      )}
    </div>
  )
}
