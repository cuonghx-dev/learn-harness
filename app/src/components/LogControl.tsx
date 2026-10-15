import { useState } from "react"
import { Circle, LoaderCircle, Square } from "lucide-react"

import { TipButton } from "@/components/TipButton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Note } from "@/lib/ipc"

type Props = {
  logFile: string | null
  notes: Note[]
  onStart: (path: string) => Promise<void>
  onStop: () => Promise<void>
}

/** "Cấu trúc dữ liệu & giải thuật" → "cau-truc-du-lieu-giai-thuat" */
function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function LogControl({ logFile, notes, onStart, onStop }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [working, setWorking] = useState(false)

  const path = name.trim() ? `notes/${slugify(name) || "bai-hoc"}.md` : ""

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

  if (logFile) {
    return (
      <TipButton
        variant="outline"
        size="sm"
        disabled={working}
        onClick={() => run(onStop)}
        className="h-7 gap-1.5 rounded-full border-red-500/40 pr-2.5 pl-2 text-xs"
        tip={`Đang ghi vào ${logFile}`}
      >
        {working ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
        )}
        <span className="max-w-36 truncate">{logFile.replace(/^notes\//, "")}</span>
        <Square className="size-3 fill-current opacity-60" />
      </TipButton>
    )
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1.5 rounded-full px-2.5 text-xs" onClick={() => setOpen(true)}>
        <Circle className="size-2.5 fill-red-500 text-red-500" />
        Ghi log
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi buổi học</DialogTitle>
            <DialogDescription>
              Hội thoại được ghi ra file markdown (như <code>/md-log</code>), kể cả phần đã nói trước đó.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Input
              autoFocus
              placeholder="Tên bài học, ví dụ: TCP/IP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && path && start(path)}
            />
            <p className="h-4 font-mono text-xs text-muted-foreground">{path}</p>
          </div>
          {notes.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Hoặc ghi tiếp vào bài có sẵn</p>
              <ScrollArea className="rounded-lg border [&>[data-slot=scroll-area-viewport]]:max-h-48">
                {notes.slice(0, 20).map((n) => (
                  <Button
                    key={n.path}
                    variant="ghost"
                    disabled={working}
                    onClick={() => start(n.path)}
                    className="block h-auto w-full truncate rounded-none border-b px-3 py-1.5 text-left font-normal last:border-b-0"
                  >
                    {n.name}
                  </Button>
                ))}
              </ScrollArea>
            </div>
          )}
          <DialogFooter>
            <Button disabled={!path || working} onClick={() => start(path)}>
              {working && <LoaderCircle className="animate-spin" />}
              Bắt đầu ghi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
