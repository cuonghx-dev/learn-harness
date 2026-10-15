import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowUp,
  Bot,
  Check,
  FileText,
  Globe,
  History,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Square,
  SquareTerminal,
  Wrench,
  X,
} from "lucide-react"

import { Markdown } from "@/components/Markdown"
import { PermissionCard } from "@/components/PermissionCard"
import { QuizCard } from "@/components/QuizCard"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toolSummary, type ChatItem, type QuizPick } from "@/lib/chat"
import type { useClaude } from "@/lib/useClaude"
import { cn } from "@/lib/utils"

type Claude = ReturnType<typeof useClaude>

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Bash: SquareTerminal,
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Agent: Bot,
  Task: Bot,
  WebSearch: Search,
  WebFetch: Globe,
  Skill: Sparkles,
}

const SUGGESTIONS = ["Dạy tôi TCP/IP hoạt động thế nào", "Giải thích đạo hàm từ con số 0", "Giảng luôn, đừng hỏi nhiều"]

export function ChatPanel({ claude, header }: { claude: Claude; header: ReactNode }) {
  const { state, send, answer, skip, decide, interrupt, newSession, lastSession } = claude
  const [draft, setDraft] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)

  // Follow new output unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.items])

  // Grow the composer with its content.
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft])

  useEffect(() => {
    if (!state.busy) input.current?.focus()
  }, [state.busy])

  const submit = (text = draft) => {
    const t = text.trim()
    if (!t || state.busy) return
    stick.current = true
    send(t)
    setDraft("")
  }

  const pendingQuiz = [...state.items].reverse().find((it) => it.kind === "quiz" && !it.answers && !it.skipped)
  const last = state.items[state.items.length - 1]
  const pendingPermission = state.items.some((it) => it.kind === "permission" && !it.decision)
  const thinking = state.busy && !pendingQuiz && !pendingPermission && !(last?.kind === "text" && last.streaming)
  const resumable = lastSession()

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {header}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Session mới"
            disabled={state.busy}
            onClick={() => newSession()}
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {state.items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="size-5" />
              </div>
              <h2 className="text-base font-semibold">Hôm nay học gì?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Bấm “Ghi log” để lưu bài giảng ra file và đọc ở giữa.</p>
            </div>
            <div className="grid w-full max-w-xs gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft(s)}
                  className="rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
              {resumable && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => newSession(resumable)}>
                  <History /> Nối lại session trước
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 py-4">
            {state.items.map((item) => (
              <Item
                key={item.id}
                item={item}
                activeQuiz={item === pendingQuiz}
                onAnswer={(a, p) => item.kind === "quiz" && answer(item, a, p)}
                onSkip={() => item.kind === "quiz" && skip(item)}
                onDecide={(d) => item.kind === "permission" && decide(item, d)}
              />
            ))}
            {thinking && (
              <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-primary/70"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
                Claude đang nghĩ…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 p-3 pt-0">
        <div className="rounded-2xl border bg-card shadow-sm focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
          <Textarea
            ref={input}
            rows={1}
            value={draft}
            placeholder={pendingQuiz ? "Trả lời câu hỏi ở trên trước nhé…" : "Hỏi Claude…"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            className="max-h-56 min-h-0 resize-none border-0 bg-transparent px-3.5 pt-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="truncate pl-1 text-[11px] text-muted-foreground">
              {state.model ? state.model.replace(/^claude-/, "") : "Enter để gửi · Shift+Enter xuống dòng"}
            </span>
            {state.busy ? (
              <Button size="icon" variant="secondary" className="size-7 rounded-full" title="Dừng" onClick={interrupt}>
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button size="icon" className="size-7 rounded-full" disabled={!draft.trim()} onClick={() => submit()}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Item({
  item,
  activeQuiz,
  onAnswer,
  onSkip,
  onDecide,
}: {
  item: ChatItem
  activeQuiz: boolean
  onAnswer: (answers: Record<string, string>, picks: QuizPick[]) => void
  onSkip: () => void
  onDecide: (decision: "allow" | "always" | "deny") => void
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="ml-10 self-end rounded-2xl rounded-br-md bg-primary/12 px-3.5 py-2 text-sm whitespace-pre-wrap select-text">
          {item.text}
        </div>
      )
    case "text":
      return (
        <div className="relative">
          <Markdown text={item.text} className="prose-sm" />
          {item.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-text-bottom" />}
        </div>
      )
    case "tool":
      return <ToolRow item={item} />
    case "quiz":
      return <QuizCard quiz={item} active={activeQuiz} onAnswer={onAnswer} onSkip={onSkip} />
    case "permission":
      return <PermissionCard perm={item} onDecide={onDecide} />
    case "notice":
      return (
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-xs",
            item.tone === "error" ? "bg-destructive/10 text-destructive" : "text-center text-muted-foreground",
          )}
        >
          {item.text}
        </div>
      )
    case "turn":
      return null
  }
}

function ToolRow({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const Icon = TOOL_ICONS[item.name] ?? Wrench
  const summary = toolSummary(item.name, item.input)
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="shrink-0 font-medium text-foreground/80">{item.name}</span>
      <span className="min-w-0 flex-1 truncate">
        {summary}
        {item.steps > 0 && <span className="opacity-70"> · {item.steps} bước{item.status === "running" && item.lastStep ? ` · ${item.lastStep}` : ""}</span>}
      </span>
      {item.status === "running" ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
      ) : item.status === "done" ? (
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <X className="size-3.5 shrink-0 text-destructive" />
      )}
    </div>
  )
}
