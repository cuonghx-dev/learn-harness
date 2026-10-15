import { useMemo, useState } from "react"
import { FileText, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm bài học"
            className="h-8 bg-background/60 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Bài học</div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="px-2 pb-3">
          {shown.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Chưa có bài nào trong notes/.</p>}
          {shown.map((n) => (
            <Button
              key={n.path}
              variant="ghost"
              onClick={() => onSelect(n.path)}
              className={cn("h-auto w-full items-start justify-start gap-2 px-2 py-1.5 text-left font-normal", selected === n.path && "bg-accent")}
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{n.name}</span>
                  {logFile === n.path && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />}
                </span>
                <span className="block text-[11px] text-muted-foreground">{ago(n.modified)}</span>
              </span>
            </Button>
          ))}
        </nav>
      </ScrollArea>
    </div>
  )
}
