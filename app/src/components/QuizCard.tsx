import { useEffect, useMemo, useState } from "react"
import { Check, CircleHelp, SkipForward } from "lucide-react"

import { Markdown } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ChatItem, QuizPick, QuizQuestion } from "@/lib/chat"
import { cn } from "@/lib/utils"

type Quiz = Extract<ChatItem, { kind: "quiz" }>

type Props = {
  quiz: Quiz
  /** Only the newest pending quiz takes number-key shortcuts. */
  active: boolean
  onAnswer: (answers: Record<string, string>, picks: QuizPick[]) => void
  onSkip: () => void
}

function answerOf(q: QuizQuestion, pick: QuizPick): string {
  const parts = [...pick.labels]
  if (pick.other.trim()) parts.push(pick.other.trim())
  return q.multiSelect ? parts.join(", ") : (parts[parts.length - 1] ?? "")
}

export function QuizCard({ quiz, active, onAnswer, onSkip }: Props) {
  const questions = quiz.input.questions ?? []
  const done = quiz.answers !== undefined || quiz.skipped
  const [picks, setPicks] = useState<QuizPick[]>(() => questions.map(() => ({ labels: [], other: "" })))

  const ready = useMemo(() => questions.every((q, i) => answerOf(q, picks[i]) !== ""), [questions, picks])

  const toggle = (qi: number, label: string) =>
    setPicks((prev) =>
      prev.map((p, i) => {
        if (i !== qi) return p
        if (!questions[qi].multiSelect) return { labels: [label], other: "" }
        return { ...p, labels: p.labels.includes(label) ? p.labels.filter((l) => l !== label) : [...p.labels, label] }
      }),
    )

  const submit = () => {
    if (!ready) return
    onAnswer(Object.fromEntries(questions.map((q, i) => [q.question, answerOf(q, picks[i])])), picks)
  }

  // 1–9 picks an option of a single-question quiz; Enter submits.
  useEffect(() => {
    if (!active || done || questions.length !== 1) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("textarea, input")) return
      const n = Number.parseInt(e.key, 10)
      const opt = questions[0].options[n - 1]
      if (opt) {
        e.preventDefault()
        toggle(0, opt.label)
      } else if (e.key === "Enter" && ready) {
        e.preventDefault()
        submit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm transition-opacity",
        !done && "border-[color-mix(in_oklch,var(--callout-question)_55%,transparent)] ring-4 ring-[color-mix(in_oklch,var(--callout-question)_12%,transparent)]",
      )}
    >
      {questions.map((q, qi) => {
        const shown = (done ? quiz.picks?.[qi] : picks[qi]) ?? { labels: [], other: "" }
        return (
          <div key={qi} className="border-b p-4 last:border-b-0">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[var(--callout-question)] uppercase">
              <CircleHelp className="size-3.5" />
              {q.header || "Câu hỏi"}
              {q.multiSelect && <span className="font-normal tracking-normal normal-case opacity-80">· chọn nhiều</span>}
            </div>
            <Markdown text={q.question} className="prose-sm mb-3 font-medium" />
            <div className="grid gap-2">
              {q.options.map((o, oi) => {
                const picked = shown.labels.includes(o.label)
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={done}
                    onClick={() => toggle(qi, o.label)}
                    className={cn(
                      "group flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      "enabled:hover:border-primary/60 enabled:hover:bg-accent disabled:cursor-default",
                      picked && "border-primary bg-primary/8",
                      done && !picked && "opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-px flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold text-muted-foreground",
                        picked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {picked ? <Check className="size-3" /> : oi + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{o.label}</span>
                      {o.description && <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>}
                    </span>
                  </button>
                )
              })}
              {!done && (
                <Input
                  placeholder="Câu trả lời khác…"
                  value={picks[qi].other}
                  onChange={(e) =>
                    setPicks((prev) =>
                      prev.map((p, i) => (i === qi ? { labels: q.multiSelect ? p.labels : [], other: e.target.value } : p)),
                    )
                  }
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="h-9 text-sm"
                />
              )}
              {done && shown.other.trim() && (
                <div className="rounded-lg border border-primary bg-primary/8 px-3 py-2 text-sm">{shown.other.trim()}</div>
              )}
            </div>
          </div>
        )
      })}
      {!done ? (
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            <SkipForward /> Bỏ qua
          </Button>
          <Button size="sm" disabled={!ready} onClick={submit}>
            Trả lời
            {active && questions.length === 1 && <kbd className="ml-1 text-[10px] opacity-70">↵</kbd>}
          </Button>
        </div>
      ) : (
        quiz.skipped && <div className="px-4 py-2 text-xs text-muted-foreground">Đã bỏ qua</div>
      )}
    </div>
  )
}
