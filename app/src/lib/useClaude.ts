import { useCallback, useEffect, useReducer, useRef } from "react"

import { chatReducer, initialChat, type ChatItem } from "@/lib/chat"
import { api, on } from "@/lib/ipc"

const LAST_SESSION_KEY = "learn:lastSession"

type Quiz = Extract<ChatItem, { kind: "quiz" }>

function readLastSession(): string | null {
  try {
    return localStorage.getItem(LAST_SESSION_KEY)
  } catch {
    return null
  }
}

export function useClaude() {
  const [state, dispatch] = useReducer(chatReducer, initialChat)
  // Generation of the process whose events we show; older ones are ignored.
  const gen = useRef(0)
  const stderr = useRef<string[]>([])
  const busy = useRef(false)
  busy.current = state.busy

  useEffect(() => {
    const accept = (g: number) => {
      if (g < gen.current) return false
      gen.current = g
      return true
    }
    const subs = [
      on.message(({ gen: g, msg }) => accept(g) && dispatch({ type: "message", msg })),
      on.stderr(({ gen: g, line }) => {
        if (accept(g)) stderr.current = [...stderr.current, line].slice(-20)
      }),
      on.exit(({ gen: g, code }) => {
        if (g !== gen.current) return
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

  useEffect(() => {
    if (!state.sessionId) return
    try {
      localStorage.setItem(LAST_SESSION_KEY, state.sessionId)
    } catch {
      // Storage unavailable: resume just won't be offered.
    }
  }, [state.sessionId])

  const fail = (e: unknown) => {
    dispatch({ type: "stopped" })
    dispatch({ type: "notice", text: String(e), tone: "error" })
  }

  const send = useCallback((text: string) => {
    dispatch({ type: "send", text })
    api.claudeSend(text).then((g) => (gen.current = Math.max(gen.current, g)), fail)
  }, [])

  const answer = useCallback((quiz: Quiz, answers: Record<string, string>) => {
    dispatch({ type: "answered", requestId: quiz.requestId, answers })
    api.claudeRespond(quiz.requestId, { behavior: "allow", updatedInput: { ...quiz.input, answers } }).catch(fail)
  }, [])

  const skip = useCallback((quiz: Quiz) => {
    dispatch({ type: "answered", requestId: quiz.requestId, skipped: true })
    api.claudeRespond(quiz.requestId, { behavior: "deny", message: "Người học bỏ qua câu hỏi này." }).catch(fail)
  }, [])

  const interrupt = useCallback(() => {
    api.claudeInterrupt().catch(fail)
    // The CLI ends the turn with a `result`; don't leave the UI stuck if it doesn't.
    setTimeout(() => busy.current && dispatch({ type: "stopped" }), 4000)
  }, [])

  const newSession = useCallback(async (resume?: string) => {
    dispatch({ type: "reset", sessionId: resume })
    try {
      gen.current = await api.claudeStart(resume)
      if (resume) dispatch({ type: "notice", text: "Đã nối lại session trước. Lịch sử xem trong file log." })
    } catch (e) {
      fail(e)
    }
  }, [])

  const notice = useCallback((text: string, tone?: "info" | "error") => dispatch({ type: "notice", text, tone }), [])

  return { state, send, answer, skip, interrupt, newSession, notice, lastSession: readLastSession }
}
