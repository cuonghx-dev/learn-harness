import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"

import { Markdown } from "@/components/Markdown"
import { Kbd } from "@/components/ui/kbd"
import { ago } from "@/lib/text"
import { cn } from "@/lib/utils"

type Props = {
  path: string | null
  content: string
  /** md-log is writing to this note right now. */
  live: boolean
  /** Both side columns hidden: wider article, borderless bar. */
  focus: boolean
  modified?: number
  /** Bumped whenever the open note was changed by something other than md-log. */
  syncedAt: number
  onOpenNote: (target: string) => void
}

/** Distance from the bottom (px) that still counts as "at the bottom". */
const STICK_PX = 40

export function NoteViewer({ path, content, live, focus, modified, syncedAt, onOpenNote }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastPath = useRef(path)
  const [behind, setBehind] = useState(false)
  const [toast, setToast] = useState(false)

  // A live log grows at the bottom: follow it unless the reader scrolled up,
  // in which case offer a pill to jump back. A newly opened note starts at the top.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (lastPath.current !== path) {
      lastPath.current = path
      el.scrollTop = live ? el.scrollHeight : 0
      stick.current = live
      setBehind(false)
    } else if (live && stick.current) {
      el.scrollTop = el.scrollHeight
    } else if (live && el.scrollHeight - el.scrollTop - el.clientHeight > STICK_PX) {
      setBehind(true)
    }
  }, [path, content, live])

  useEffect(() => {
    if (!syncedAt) return
    setToast(true)
    const t = setTimeout(() => setToast(false), 3000)
    return () => clearTimeout(t)
  }, [syncedAt])

  const jumpDown = () => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    stick.current = true
    setBehind(false)
  }

  const name = path?.split("/").pop()?.replace(/\.md$/, "")
  const dir = path?.split("/").slice(0, -1).join("/") ?? ""

  return (
    <div className={cn("relative flex h-full min-w-0 flex-col bg-background", focus && "focus-mode")}>
      {focus ? (
        <div data-tauri-drag-region className="flex h-[50px] shrink-0 items-center justify-between px-7">
          <Kbd>⌘B</Kbd>
          <span data-tauri-drag-region className="truncate font-mono text-[11.5px] text-muted-3">
            {path}
            {path && modified ? ` · sửa ${ago(modified)}` : ""}
          </span>
          <Kbd>⌘J</Kbd>
        </div>
      ) : (
        <div data-tauri-drag-region className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-divider px-7">
          <span data-tauri-drag-region className="truncate font-mono text-[11.5px] text-muted-3">
            {path}
          </span>
          {live && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-[5px] bg-rec-tint px-[9px] py-1 text-[11.5px] font-semibold text-rec-text">
              <span className="size-1.5 animate-rec-blink rounded-full bg-rec" />
              Đang ghi
            </span>
          )}
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
          if (stick.current) setBehind(false)
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {path ? (
          <article className={cn("mx-auto px-8 pt-9 pb-24", focus ? "max-w-[724px]" : "max-w-[664px]")}>
            <h1
              className={cn(
                "mb-[18px] font-serif leading-[1.2] font-semibold tracking-[-0.01em] text-ink",
                focus ? "text-[38px]" : "text-[32px]",
              )}
            >
              {name}
            </h1>
            <Markdown text={content} baseDir={dir} onOpenNote={onOpenNote} className="article" />
          </article>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-8 text-center">
            <p className="font-serif text-[22px] text-muted-1">Chưa mở bài nào</p>
            <p className="max-w-[300px] text-[13px] leading-relaxed text-muted-3">
              Chọn một bài ở danh sách bên trái, hoặc hỏi Claude để bắt đầu buổi học mới.
            </p>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-muted-3">
              <span className="flex items-center gap-1.5">
                <Kbd>⌘B</Kbd> danh sách bài
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>⌘J</Kbd> trò chuyện
              </span>
            </div>
          </div>
        )}
      </div>

      {behind && (
        <button
          onClick={jumpDown}
          className="absolute bottom-[22px] left-1/2 flex h-[34px] -translate-x-1/2 animate-pop-in items-center gap-1.5 rounded-[17px] bg-ink px-4 text-[12.5px] font-medium text-white shadow-pill"
        >
          <ArrowDown className="size-3.5" />
          Nội dung mới · đã tạm ngừng tự cuộn
        </button>
      )}

      {toast && (
        <div className="absolute top-[62px] right-4 flex animate-pop-in items-center gap-1.5 rounded-[6px] border bg-white px-2.5 py-1.5 text-[11.5px] text-muted-1">
          <span className="size-1.5 rounded-full bg-synced" />
          Đã cập nhật từ Obsidian
        </div>
      )}
    </div>
  )
}
