import { useEffect, useMemo, useState } from "react"
import { Check, X } from "lucide-react"

import { Markdown } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { DONT_KNOW, type ChatItem, type QuizGrade, type QuizPick, type QuizQuestion } from "@/lib/chat"
import { fold } from "@/lib/text"
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

/** The question's options plus the always-present "I don't know". */
function optionsOf(q: QuizQuestion) {
  const opts = q.options.filter((o) => o.label !== DONT_KNOW)
  return [...opts, { label: DONT_KNOW, description: undefined }]
}

const same = (a: string, b: string) => fold(a).trim() === fold(b).trim()

export function QuizCard({ quiz, active, onAnswer, onSkip }: Props) {
  const questions = quiz.input.questions ?? []
  const done = quiz.answers !== undefined || !!quiz.skipped
  const [picks, setPicks] = useState<QuizPick[]>(() => questions.map(() => ({ labels: [], other: "" })))

  const ready = useMemo(() => questions.every((q, i) => answerOf(q, picks[i]) !== ""), [questions, picks])

  const toggle = (qi: number, label: string) =>
    setPicks((prev) =>
      prev.map((p, i) => {
        if (i !== qi) return p
        if (!questions[qi].multiSelect || label === DONT_KNOW) {
          return { labels: p.labels.length === 1 && p.labels[0] === label ? [] : [label], other: "" }
        }
        const rest = p.labels.filter((l) => l !== DONT_KNOW)
        return { ...p, labels: rest.includes(label) ? rest.filter((l) => l !== label) : [...rest, label] }
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
      const opt = optionsOf(questions[0])[n - 1]
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

  const status = quiz.skipped ? "Đã bỏ qua" : quiz.grade ? "Đã chấm" : done ? "Đã trả lời" : null

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl bg-white p-3.5",
        done ? "border border-border" : "border-[1.5px] border-primary shadow-quiz",
      )}
    >
      <div className="text-[11px] font-bold tracking-[.06em] text-primary uppercase">
        Quiz{status && ` · ${status}`}
        {questions.length > 1 && <span className="font-medium tracking-normal text-muted-2 normal-case"> · {questions.length} câu</span>}
      </div>

      {questions.map((q, qi) => (
        <Question
          key={qi}
          q={q}
          pick={(done ? quiz.picks?.[qi] : picks[qi]) ?? { labels: [], other: "" }}
          grade={quiz.grade?.[qi]}
          done={done}
          numbered={questions.length === 1}
          onToggle={(label) => toggle(qi, label)}
          onOther={(other) =>
            setPicks((prev) => prev.map((p, i) => (i === qi ? { labels: q.multiSelect ? p.labels.filter((l) => l !== DONT_KNOW) : [], other } : p)))
          }
          onEnter={submit}
          divided={qi > 0}
        />
      ))}

      {!done && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onSkip} className="h-[30px] rounded-lg px-3 text-[13px] text-muted-1">
            Bỏ qua
          </Button>
          <Button disabled={!ready} onClick={submit} className="h-[30px] rounded-lg px-3.5 text-[13px] font-semibold">
            Gửi
          </Button>
        </div>
      )}
    </div>
  )
}

function Question({
  q,
  pick,
  grade,
  done,
  numbered,
  divided,
  onToggle,
  onOther,
  onEnter,
}: {
  q: QuizQuestion
  pick: QuizPick
  grade?: QuizGrade
  done: boolean
  numbered: boolean
  divided: boolean
  onToggle: (label: string) => void
  onOther: (text: string) => void
  onEnter: () => void
}) {
  const isCorrect = (label: string) => !!grade?.correct.some((c) => same(c, label))
  const other = pick.other.trim()

  return (
    <div className={cn("flex flex-col gap-2.5", divided && "border-t border-divider pt-3")}>
      <div className="flex items-start gap-2">
        <Markdown text={q.question} className="chat min-w-0 flex-1 text-[14px] font-medium text-ink" />
        {q.multiSelect && (
          <span className="mt-0.5 shrink-0 rounded-[4px] border border-input px-1.5 text-[11px] leading-[18px] text-muted-2">chọn nhiều</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {optionsOf(q).map((o, oi) => {
          const picked = pick.labels.includes(o.label)
          const dontKnow = o.label === DONT_KNOW
          const right = grade && isCorrect(o.label)
          const wrong = grade && picked && !right
          return (
            <button
              key={oi}
              disabled={done}
              aria-pressed={picked}
              onClick={() => onToggle(o.label)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[13.5px] leading-snug",
                dontKnow ? "border-dashed border-[#d8cfbf] text-muted-2" : "border-border text-ink-2",
                !done && "hover:border-[#c9bfae]",
                picked && "border-solid border-primary bg-accent-tint",
                done && !picked && !right && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-4 shrink-0 items-center justify-center border border-[#c9bfae] bg-white",
                  q.multiSelect ? "rounded-[4px]" : "rounded-full",
                  picked && "border-primary bg-primary text-white",
                )}
              >
                {picked && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{o.label}</span>
                {o.description && <span className="mt-0.5 block text-[12px] text-muted-2">{o.description}</span>}
              </span>
              {right ? (
                <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.5} />
              ) : wrong ? (
                <X className="mt-0.5 size-4 shrink-0 text-bad" strokeWidth={2.5} />
              ) : (
                numbered && !done && <span className="mt-px shrink-0 font-mono text-[11px] text-placeholder">{oi + 1}</span>
              )}
            </button>
          )
        })}

        {!done ? (
          <input
            placeholder="Hoặc tự gõ câu trả lời…"
            value={pick.other}
            onChange={(e) => onOther(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && onEnter()}
            className="h-[34px] rounded-lg border border-border bg-white px-2.5 text-[13px] outline-none placeholder:text-placeholder focus:border-primary"
          />
        ) : (
          other && (
            <div className="flex items-start gap-2.5 rounded-lg border border-primary bg-accent-tint px-2.5 py-2 text-[13.5px] text-ink-2">
              <span className="min-w-0 flex-1">{other}</span>
              {grade && (grade.ok ? <Check className="size-4 shrink-0 text-ok" /> : <X className="size-4 shrink-0 text-bad" />)}
            </div>
          )
        )}
      </div>

      {grade && (
        <div className="text-[13px] leading-relaxed">
          <span className={cn("font-semibold", grade.ok ? "text-ok" : "text-bad")}>{grade.ok ? "✓ Đúng" : "✗ Chưa đúng"}</span>
          {!grade.ok && grade.correct.length > 0 && (
            <span className="text-ok-dark"> · Đáp án: {grade.correct.join(", ")}</span>
          )}
          {grade.explanation && <p className="mt-1 text-muted-1">{grade.explanation}</p>}
        </div>
      )}
    </div>
  )
}
