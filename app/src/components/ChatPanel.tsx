import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRight, ArrowUp, Check, ChevronDown, Plus, RotateCcw, ShieldOff, X } from "lucide-react"

import { Markdown } from "@/components/Markdown"
import { PermissionCard } from "@/components/PermissionCard"
import { QuizCard } from "@/components/QuizCard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toolSummary, type ChatItem, type QuizPick } from "@/lib/chat"
import { ago } from "@/lib/text"
import type { useClaude } from "@/lib/useClaude"
import { cn } from "@/lib/utils"

type Claude = ReturnType<typeof useClaude>
type Tool = Extract<ChatItem, { kind: "tool" }>
/** Consecutive tool calls render as one activity row. */
type Row = { kind: "tools"; id: string; tools: Tool[] } | { kind: "item"; item: ChatItem }

const SUGGESTIONS = ["Dạy tôi TCP/IP hoạt động thế nào", "Giải thích quy hoạch động bằng ví dụ", "Ôn lại Đại số tuyến tính bằng quiz"]

function rows(items: ChatItem[]): Row[] {
  const out: Row[] = []
  for (const item of items) {
    const prev = out[out.length - 1]
    if (item.kind === "tool" && prev?.kind === "tools") prev.tools.push(item)
    else if (item.kind === "tool") out.push({ kind: "tools", id: item.id, tools: [item] })
    else if (item.kind !== "turn") out.push({ kind: "item", item })
  }
  return out
}

export function ChatPanel({ claude, logControl }: { claude: Claude; logControl: ReactNode }) {
  const { state, send, answer, skip, decide, interrupt, newSession, lastSession, skipPermissions, setSkipPermissions } = claude
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

  const pendingQuiz = [...state.items].reverse().find((it) => it.kind === "quiz" && !it.answers && !it.skipped)

  useEffect(() => {
    if (!state.busy && !pendingQuiz) input.current?.focus()
  }, [state.busy, pendingQuiz])

  const submit = (text = draft) => {
    const t = text.trim()
    if (!t || state.busy || pendingQuiz) return
    stick.current = true
    send(t)
    if (text === draft) setDraft("")
  }

  const last = state.items[state.items.length - 1]
  const pendingPermission = state.items.some((it) => it.kind === "permission" && !it.decision)
  const toolRunning = state.items.some((it) => it.kind === "tool" && it.status === "running")
  const thinking =
    state.busy && !pendingQuiz && !pendingPermission && !toolRunning && !(last?.kind === "text" && last.streaming)
  const resumable = lastSession()
  const locked = !!pendingQuiz
  // Notices alone (e.g. "started recording") don't end the welcome screen.
  const empty = state.items.every((it) => it.kind === "notice")

  return (
    <div className="flex h-full min-w-0 flex-col bg-chat">
      <div data-tauri-drag-region className="flex h-[50px] shrink-0 items-center gap-2 border-b border-divider px-3.5">
        <span data-tauri-drag-region className="text-[13px] font-semibold">
          Trò chuyện
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {logControl}
          <button
            title={skipPermissions ? "Đang bỏ qua cấp quyền (--dangerously-skip-permissions). Bấm để tắt" : "Bỏ qua cấp quyền (--dangerously-skip-permissions)"}
            aria-label="Bỏ qua cấp quyền"
            aria-pressed={skipPermissions}
            onClick={() => setSkipPermissions(!skipPermissions)}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-[7px]",
              skipPermissions ? "bg-bad/10 text-bad hover:bg-bad/15" : "text-muted-1 hover:bg-tint",
            )}
          >
            <ShieldOff className="size-4" />
          </button>
          <button
            title="Session mới"
            aria-label="Session mới"
            disabled={state.busy}
            onClick={() => newSession()}
            className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-1 hover:bg-tint disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {empty ? (
          <div className="flex min-h-full flex-col justify-center gap-[22px] px-7 py-8">
            <h2 className="font-serif text-[30px] leading-[1.2] tracking-[-0.01em] text-ink">Hôm nay học gì?</h2>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-[9px] border border-border bg-white px-3.5 py-[11px] text-left text-[13px] text-ink-2 hover:border-[#c9bfae]"
                >
                  {s}
                </button>
              ))}
            </div>
            {resumable && (
              <button
                onClick={() => newSession(resumable.id)}
                className="flex items-center gap-3 rounded-[9px] bg-tint px-3.5 py-3 text-left hover:bg-[#ece6da]"
              >
                <RotateCcw className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">Nối lại session trước</span>
                  {(resumable.title || resumable.at) && (
                    <span className="block truncate text-[11.5px] text-muted-2">
                      {[resumable.title, resumable.at && ago(resumable.at)].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-2" />
              </button>
            )}
            {state.items.map((item) => (
              <Item key={item.id} item={item} activeQuiz={false} onAnswer={() => {}} onSkip={() => {}} onDecide={() => {}} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-3.5 p-[18px]">
            {rows(state.items).map((row) =>
              row.kind === "tools" ? (
                <ToolGroup key={row.id} tools={row.tools} />
              ) : (
                <Item
                  key={row.item.id}
                  item={row.item}
                  activeQuiz={row.item === pendingQuiz}
                  onAnswer={(a, p) => row.item.kind === "quiz" && answer(row.item, a, p)}
                  onSkip={() => row.item.kind === "quiz" && skip(row.item)}
                  onDecide={(d) => row.item.kind === "permission" && decide(row.item, d)}
                />
              ),
            )}
            {thinking && (
              <div className="flex items-center gap-1 py-1" aria-label="Claude đang nghĩ">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3.5 pt-3 pb-3.5">
        <div
          className={cn(
            "rounded-xl border px-3 pt-3 pb-2",
            locked ? "border-border bg-[#f7f4ee]" : "border-input bg-white focus-within:border-[#c9bfae]",
          )}
        >
          <textarea
            ref={input}
            rows={1}
            value={draft}
            disabled={locked}
            placeholder={locked ? "Trả lời quiz ở trên trước nhé ↑" : "Hỏi Claude…"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            className={cn(
              "block max-h-56 min-h-9 w-full resize-none bg-transparent text-[13.5px] leading-normal text-ink outline-none",
              locked ? "placeholder:text-primary" : "placeholder:text-placeholder",
            )}
          />
          <div className="mt-1 flex items-center gap-2">
            <span className="min-w-0 truncate font-mono text-[11px] text-placeholder">{state.model ?? "claude"}</span>
            {skipPermissions && <span className="shrink-0 text-[11px] font-medium text-bad">bỏ qua cấp quyền</span>}
            <span className="ml-auto truncate text-[11px] text-[#a9a397]">Enter gửi · ⇧Enter xuống dòng</span>
            {state.busy ? (
              <button
                title="Dừng"
                aria-label="Dừng"
                onClick={interrupt}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink hover:bg-ink/90"
              >
                <span className="size-[9px] rounded-[1.5px] bg-white" />
              </button>
            ) : (
              <button
                aria-label="Gửi"
                disabled={!draft.trim() || locked}
                onClick={() => submit()}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink text-white disabled:bg-[#e7e2d8] disabled:text-white"
              >
                <ArrowUp className="size-4" />
              </button>
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
        <div className="max-w-[80%] self-end rounded-[13px_13px_4px_13px] bg-bubble px-[13px] py-[9px] text-[14px] leading-[1.6] whitespace-pre-wrap text-ink select-text">
          {item.text}
        </div>
      )
    case "text":
      return (
        <div>
          <Markdown text={item.text} className="chat" />
          {item.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-text-bottom" />}
        </div>
      )
    case "quiz":
      return <QuizCard quiz={item} active={activeQuiz} onAnswer={onAnswer} onSkip={onSkip} />
    case "permission":
      return <PermissionCard perm={item} onDecide={onDecide} />
    case "notice":
      return item.tone === "error" ? (
        <Alert variant="destructive" className="px-3 py-2">
          <AlertDescription className="text-xs">{item.text}</AlertDescription>
        </Alert>
      ) : (
        <div className="text-center text-[12px] text-muted-3">{item.text}</div>
      )
    default:
      return null
  }
}

function describe(tool: Tool) {
  const summary = toolSummary(tool.name, tool.input)
  return summary ? `${tool.name} · ${summary}` : tool.name
}

function ToolGroup({ tools }: { tools: Tool[] }) {
  const [open, setOpen] = useState(false)
  const running = tools.filter((t) => t.status === "running")
  const current = running[running.length - 1] ?? tools[tools.length - 1]
  const failed = running.length === 0 && tools.some((t) => t.status === "error")
  const steps = tools.reduce((n, t) => n + 1 + t.steps, 0)
  const detail = current.status === "running" && current.lastStep ? current.lastStep : describe(current)

  return (
    <div className="rounded-[7px] bg-[#f4f0e8] text-[12px] text-muted-2">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full min-w-0 items-center gap-2 px-2.5 py-[7px] text-left">
        {running.length > 0 ? (
          <span className="size-3 shrink-0 animate-spin-fast rounded-full border-[1.5px] border-primary border-t-transparent" />
        ) : failed ? (
          <X className="size-3 shrink-0 text-bad" />
        ) : (
          <Check className="size-3 shrink-0 text-ok" />
        )}
        <span className="min-w-0 flex-1 truncate">{detail}</span>
        <span className="shrink-0 font-mono text-[11px]">{steps} bước</span>
        <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 border-t border-[#e9e3d7] px-2.5 py-2">
          {tools.map((t) => (
            <li key={t.id} className="flex min-w-0 items-center gap-2">
              {t.status === "running" ? (
                <span className="size-2.5 shrink-0 animate-spin-fast rounded-full border border-primary border-t-transparent" />
              ) : t.status === "done" ? (
                <Check className="size-2.5 shrink-0 text-ok" />
              ) : (
                <X className="size-2.5 shrink-0 text-bad" />
              )}
              <span className="min-w-0 flex-1 truncate">{describe(t)}</span>
              {t.steps > 0 && <span className="shrink-0 font-mono text-[11px]">+{t.steps}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
