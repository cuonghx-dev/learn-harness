import { useMemo, useState } from "react"
import { FileText, Search } from "lucide-react"

import type { Note } from "@/lib/ipc"
import { cn } from "@/lib/utils"

type Props = {
  notes: Note[]
  selected: string | null
  logFile: string | null
  onSelect: (path: string) => void
}

const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" })

function ago(ms: number) {
  const s = (ms - Date.now()) / 1000
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ]
  let v = s
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit)
    v /= n
  }
  return rtf.format(Math.round(v), "year")
}

export function NotesSidebar({ notes, selected, logFile, onSelect }: Props) {
  const [query, setQuery] = useState("")
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? notes.filter((n) => n.path.toLowerCase().includes(q)) : notes
  }, [notes, query])

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Room for the macOS traffic lights. */}
      <div data-tauri-drag-region className="h-11 shrink-0" />
      <div className="px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-lg border bg-background/60 px-2.5 text-sm text-muted-foreground focus-within:border-primary/50">
          <Search className="size-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm bài học"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Bài học</div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {shown.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Chưa có bài nào trong notes/.</p>}
        {shown.map((n) => (
          <button
            key={n.path}
            type="button"
            onClick={() => onSelect(n.path)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent",
              selected === n.path && "bg-accent",
            )}
          >
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm">{n.name}</span>
                {logFile === n.path && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />}
              </span>
              <span className="block text-[11px] text-muted-foreground">{ago(n.modified)}</span>
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}
