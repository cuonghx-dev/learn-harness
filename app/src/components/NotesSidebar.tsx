import { useMemo, useState } from "react"
import { X } from "lucide-react"

import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Note } from "@/lib/ipc"
import { ago, fuzzyMatch } from "@/lib/text"
import { cn } from "@/lib/utils"

type Props = {
  notes: Note[]
  selected: string | null
  logFile: string | null
  onSelect: (path: string) => void
}

/** `text` with the characters at `hits` wrapped in <mark>. */
function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>
  const chars = Array.from(text.normalize("NFC"))
  const set = new Set(hits)
  const out: React.ReactNode[] = []
  let run = ""
  let marked = false
  const flush = () => {
    if (!run) return
    out.push(marked ? <mark key={out.length} className="rounded-[2px] bg-[#f3d9c9] text-inherit">{run}</mark> : run)
    run = ""
  }
  chars.forEach((ch, i) => {
    if (set.has(i) !== marked) {
      flush()
      marked = set.has(i)
    }
    run += ch
  })
  flush()
  return <>{out}</>
}

export function NotesSidebar({ notes, selected, logFile, onSelect }: Props) {
  const [query, setQuery] = useState("")
  const shown = useMemo(
    () =>
      notes.flatMap((n) => {
        const hits = fuzzyMatch(n.name, query)
        return hits ? [{ note: n, hits }] : []
      }),
    [notes, query],
  )

  return (
    <div className="flex h-full w-[248px] flex-col gap-3 px-2.5 py-3.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold">Bài học</span>
        <Kbd>⌘B</Kbd>
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Tìm bài học"
          className="h-8 w-full rounded-[7px] border border-[#e0dacd] bg-white px-2.5 pr-7 text-[12.5px] outline-none placeholder:text-placeholder focus:border-[1.5px] focus:border-primary focus:px-[9.5px] focus:pr-[27.5px]"
        />
        {query && (
          <button
            aria-label="Xoá"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-3 hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <ScrollArea className="-mx-1 min-h-0 flex-1">
        <nav className="flex flex-col gap-0.5 px-1">
          {shown.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-muted-3">{query ? "Không có bài nào khớp." : "Chưa có bài nào trong notes/."}</p>
          )}
          {shown.map(({ note: n, hits }) => {
            const active = selected === n.path
            return (
              <button
                key={n.path}
                onClick={() => onSelect(n.path)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-[7px] px-2.5 py-2 text-left hover:bg-[#ebe6dc]",
                  active && "bg-active-row hover:bg-active-row",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn("truncate text-[13px] text-ink", active ? "font-semibold" : "font-medium")}>
                    <Highlight text={n.name} hits={hits} />
                  </span>
                  {logFile === n.path && <span className="size-[7px] shrink-0 animate-rec-blink rounded-full bg-rec" />}
                </span>
                <span className="text-[11.5px] text-muted-3">{ago(n.modified)}</span>
              </button>
            )
          })}
        </nav>
      </ScrollArea>
    </div>
  )
}
