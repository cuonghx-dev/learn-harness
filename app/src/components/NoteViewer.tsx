import { useLayoutEffect, useRef, type ReactNode } from "react"
import { BookOpen } from "lucide-react"

import { Markdown } from "@/components/Markdown"

type Props = {
  path: string | null
  content: string
  live: boolean
  toolbar: ReactNode
  onOpenNote: (target: string) => void
}

export function NoteViewer({ path, content, live, toolbar, onOpenNote }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastPath = useRef(path)

  // A live log grows at the bottom: follow it unless the reader scrolled up.
  // A newly opened note starts at the top.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (lastPath.current !== path) {
      lastPath.current = path
      el.scrollTop = live ? el.scrollHeight : 0
      stick.current = live
    } else if (live && stick.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [path, content, live])

  const name = path?.split("/").pop()?.replace(/\.md$/, "")
  const dir = path?.split("/").slice(0, -1).join("/") ?? ""

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {toolbar}
        {name && (
          <div data-tauri-drag-region className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium">{name}</span>
            {live && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-600 uppercase dark:text-red-400">
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                Đang ghi
              </span>
            )}
          </div>
        )}
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {path ? (
          <article className="mx-auto max-w-3xl px-10 pt-8 pb-24">
            <h1 className="mb-6 text-3xl font-bold tracking-tight">{name}</h1>
            <Markdown text={content} baseDir={dir} onOpenNote={onOpenNote} className="text-[15.5px] leading-relaxed" />
          </article>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <BookOpen className="size-10 opacity-40" />
            <p className="text-sm">Chọn một bài học bên trái, hoặc bấm “Ghi log” để bắt đầu.</p>
          </div>
        )}
      </div>
    </div>
  )
}
