import { useCallback, useEffect, useReducer, useRef } from "react"

import { chatReducer, initialChat, type ChatItem, type QuizPick } from "@/lib/chat"
import { api, on } from "@/lib/ipc"

const LAST_SESSION_KEY = "learn:lastSession"

type Quiz = Extract<ChatItem, { kind: "quiz" }>
type Permission = Extract<ChatItem, { kind: "permission" }>

/** The session "Nối lại session trước" resumes. */
export type LastSession = { id: string; title?: string; at?: number }

function readLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    if (!raw) return null
    // Older builds stored the bare session id.
    if (!raw.startsWith("{")) return { id: raw }
    const v = JSON.parse(raw) as LastSession
    return typeof v.id === "string" ? v : null
  } catch {
    return null
  }
}

/** `logFile`: the note md-log writes to, used to name the session for resuming. */
export function useClaude(logFile?: string | null) {
  const [state, dispatch] = useReducer(chatReducer, initialChat)
  // Generation of the process whose events we show; older ones are ignored.
  const gen = useRef(0)
  // Lowest generation still accepted: raised on reset, before the new process's
  // generation is known, so a replaced process can't write into the new chat.
  const minGen = useRef(0)
  const stderr = useRef<string[]>([])
  const busy = useRef(false)
  busy.current = state.busy

  useEffect(() => {
    const accept = (g: number) => {
      if (g < gen.current || g < minGen.current) return false
      gen.current = g
      return true
    }
    const subs = [
      on.message(({ gen: g, msg }) => accept(g) && dispatch({ type: "message", msg })),
      on.stderr(({ gen: g, line }) => {
        if (accept(g)) stderr.current = [...stderr.current, line].slice(-20)
      }),
      on.exit(({ gen: g, code }) => {
        if (g !== gen.current || g < minGen.current) return
        if (busy.current || (code !== 0 && code !== null)) {
          const tail = stderr.current.slice(-3).join("\n")
          dispatch({ type: "stopped" })
          dispatch({ type: "notice", text: `Claude đã thoát (mã ${code ?? "?"})${tail ? `: ${tail}` : ""}`, tone: "error" })
        }
        stderr.current = []
      }),
    ]
    return () => subs.forEach((p) => p.then((off) => off()))
  }, [])

  const firstAsk = state.items.find((it) => it.kind === "user")?.text
  useEffect(() => {
    if (!state.sessionId) return
    const title = logFile?.split("/").pop()?.replace(/\.md$/, "") ?? firstAsk?.split("\n")[0].slice(0, 60)
    const prev = readLastSession()
    // A resumed session has no chat yet: keep the name it was saved with.
    const last: LastSession = { id: state.sessionId, title: title ?? (prev?.id === state.sessionId ? prev.title : undefined), at: Date.now() }
    try {
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(last))
    } catch {
      // Storage unavailable: resume just won't be offered.
    }
  }, [state.sessionId, logFile, firstAsk, state.busy])

  const fail = (e: unknown) => {
    dispatch({ type: "stopped" })
    dispatch({ type: "notice", text: String(e), tone: "error" })
  }

  const send = useCallback((text: string) => {
    dispatch({ type: "send", text })
    api.claudeSend(text).then((g) => (gen.current = Math.max(gen.current, g)), fail)
  }, [])

  const answer = useCallback((quiz: Quiz, answers: Record<string, string>, picks: QuizPick[]) => {
    dispatch({ type: "answered", requestId: quiz.requestId, answers, picks })
    api.claudeRespond(quiz.requestId, { behavior: "allow", updatedInput: { ...quiz.input, answers } }).catch(fail)
  }, [])

  const skip = useCallback((quiz: Quiz) => {
    dispatch({ type: "answered", requestId: quiz.requestId, skipped: true })
    api.claudeRespond(quiz.requestId, { behavior: "deny", message: "Người học bỏ qua câu hỏi này." }).catch(fail)
  }, [])

  const decide = useCallback((perm: Permission, decision: "allow" | "always" | "deny") => {
    dispatch({ type: "decided", requestId: perm.requestId, decision })
    const response =
      decision === "deny"
        ? { behavior: "deny", message: "Người học không cho phép thao tác này." }
        : { behavior: "allow", updatedInput: perm.input }
    api.claudeRespond(perm.requestId, response, decision === "always" ? perm.tool : undefined).catch(fail)
  }, [])

  const interrupt = useCallback(() => {
    api.claudeInterrupt().catch(fail)
    // The CLI ends the turn with a `result`; don't leave the UI stuck if it doesn't.
    setTimeout(() => busy.current && dispatch({ type: "stopped" }), 4000)
  }, [])

  const newSession = useCallback(async (resume?: string) => {
    minGen.current = gen.current + 1
    dispatch({ type: "reset", sessionId: resume })
    try {
      gen.current = await api.claudeStart(resume)
      if (resume) dispatch({ type: "notice", text: "Đã nối lại session trước. Lịch sử xem trong file log." })
    } catch (e) {
      fail(e)
    }
  }, [])

  const notice = useCallback((text: string, tone?: "info" | "error") => dispatch({ type: "notice", text, tone }), [])

  return { state, send, answer, skip, decide, interrupt, newSession, notice, lastSession: readLastSession }
}
