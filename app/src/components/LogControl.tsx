import { useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Note } from "@/lib/ipc"
import { slugify } from "@/lib/text"
import { cn } from "@/lib/utils"

type Props = {
  logFile: string | null
  notes: Note[]
  onStart: (path: string) => Promise<void>
  onStop: () => Promise<void>
}

/** How far the popover reaches past the chat column's left edge. */
const OVERHANG = 56

/** `notes/<slug>.md`, with `-2`, `-3`… when that file already exists. */
function freePath(name: string, notes: Note[]) {
  const slug = slugify(name) || "bai-hoc"
  const taken = new Set(notes.map((n) => n.path))
  let path = `notes/${slug}.md`
  for (let i = 2; taken.has(path); i++) path = `notes/${slug}-${i}.md`
  return path
}

export function LogControl({ logFile, notes, onStart, onStop }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [working, setWorking] = useState(false)
  const [offset, setOffset] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)

  const path = name.trim() ? freePath(name, notes) : ""

  const run = async (fn: () => Promise<void>) => {
    setWorking(true)
    try {
      await fn()
    } finally {
      setWorking(false)
    }
  }

  const start = (p: string) =>
    run(async () => {
      await onStart(p)
      setOpen(false)
      setName("")
    })

  const onOpenChange = (next: boolean) => {
    if (next && trigger.current) {
      // Line the popover's left edge up OVERHANG px left of the chat column.
      const column = trigger.current.closest("aside")?.getBoundingClientRect().left ?? 0
      setOffset(column - trigger.current.getBoundingClientRect().left - OVERHANG)
    }
    setOpen(next)
  }

  if (logFile) {
    return (
      <button
        disabled={working}
        onClick={() => run(onStop)}
        title="Bấm để dừng ghi"
        className="flex h-7 min-w-0 items-center gap-1.5 rounded-[14px] bg-rec px-[11px] text-[12px] font-semibold text-white hover:bg-rec-text disabled:opacity-70"
      >
        {working ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <span className="size-[7px] shrink-0 animate-rec-blink rounded-full bg-white" />
        )}
        <span className="truncate">{logFile.split("/").pop()}</span>
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[14px] border border-input px-[11px] text-[12px] font-medium text-muted-1 hover:bg-tint",
            open && "border-[#c9bfae] bg-tint",
          )}
        >
          <span className="size-[7px] rounded-full bg-rec" />
          Ghi log
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        alignOffset={offset}
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).querySelector("input")?.focus()
        }}
        className="flex w-[340px] flex-col gap-3.5 rounded-xl border-input p-4 shadow-popover data-[state=open]:animate-pop-in"
      >
        <div className="text-[13px] font-semibold">Ghi buổi học ra file</div>
        <div className="flex flex-col gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && path && !e.nativeEvent.isComposing) {
                e.preventDefault()
                start(path)
              }
            }}
            placeholder="Tên bài học, ví dụ: TCP/IP"
            className="h-[38px] w-full rounded-lg border border-input bg-white px-3 text-[13.5px] outline-none placeholder:text-placeholder focus:border-primary focus:shadow-[0_0_0_3px_rgba(178,85,47,.12),inset_0_0_0_0.5px_var(--primary)]"
          />
          <div className="h-4 truncate font-mono text-[11.5px] text-muted-2">{path ? `→ ${path}` : ""}</div>
        </div>
        <p className="text-[12px] leading-snug text-muted-2">Ghi cả phần đã trò chuyện trước khi bấm ghi.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="h-8 rounded-lg px-3 text-[13px] text-muted-1" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button
            disabled={!path || working}
            onClick={() => start(path)}
            className="h-8 rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-ink/90"
          >
            {working && <LoaderCircle className="animate-spin" />}
            Bắt đầu ghi ↵
          </Button>
        </div>
        {notes.length > 0 && (
          <>
            <div className="-mx-4 h-px bg-divider" />
            <div className="text-[11.5px] font-semibold tracking-[.06em] text-muted-3 uppercase">Hoặc ghi tiếp vào bài có sẵn</div>
            <ScrollArea className="-mx-2 [&>[data-slot=scroll-area-viewport]]:max-h-44">
              {notes.slice(0, 30).map((n) => (
                <button
                  key={n.path}
                  disabled={working}
                  onClick={() => start(n.path)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-[7px] px-2 py-1.5 text-left hover:bg-[#f6f2ea] focus-visible:bg-[#f6f2ea] focus-visible:outline-none"
                >
                  <span className="truncate text-[13px] text-ink">{n.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-placeholder">{n.path.split("/").pop()}</span>
                </button>
              ))}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
