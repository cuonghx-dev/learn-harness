// Folds the CLI's stream-json messages into a list of chat items.
//
// Text arrives twice: as `stream_event` deltas (live typing) and then as the
// complete `assistant` message, which replaces the streamed draft. Subagent
// traffic (`parent_tool_use_id` set) is folded into its parent Agent tool card.
import type { ClaudeMessage } from "@/lib/ipc"

export const QUIZ_TOOL = "AskUserQuestion"

export type QuizOption = { label: string; description?: string }
export type QuizQuestion = { question: string; header?: string; options: QuizOption[]; multiSelect?: boolean }
/** What the learner picked for one question: option labels plus free text. */
export type QuizPick = { labels: string[]; other: string }

export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "text"; id: string; msgId: string; text: string; streaming: boolean }
  | {
      kind: "tool"
      id: string
      name: string
      input: ClaudeMessage
      status: "running" | "done" | "error"
      steps: number
      lastStep?: string
    }
  | {
      kind: "quiz"
      id: string
      requestId: string
      input: { questions: QuizQuestion[] }
      answers?: Record<string, string>
      /** Per question, what was picked; kept so labels containing ", " still display right. */
      picks?: QuizPick[]
      skipped?: boolean
    }
  | {
      kind: "permission"
      id: string
      requestId: string
      tool: string
      input: ClaudeMessage
      decision?: "allow" | "always" | "deny"
    }
  | { kind: "notice"; id: string; text: string; tone: "info" | "error" }
  | { kind: "turn"; id: string; durationMs?: number; costUsd?: number }

export type ChatState = {
  items: ChatItem[]
  busy: boolean
  sessionId?: string
  model?: string
  /** Message id of the assistant message currently streaming. */
  streamMsg?: string
}

export const initialChat: ChatState = { items: [], busy: false }

export type ChatAction =
  | { type: "message"; msg: ClaudeMessage }
  | { type: "send"; text: string }
  | { type: "answered"; requestId: string; answers?: Record<string, string>; picks?: QuizPick[]; skipped?: boolean }
  | { type: "decided"; requestId: string; decision: "allow" | "always" | "deny" }
  | { type: "notice"; text: string; tone?: "info" | "error" }
  | { type: "stopped" }
  | { type: "reset"; sessionId?: string }

let seq = 0
const uid = (p: string) => `${p}-${++seq}`

function update(items: ChatItem[], id: string, fn: (item: ChatItem) => ChatItem): ChatItem[] {
  const i = items.findIndex((it) => it.id === id)
  if (i === -1) return items
  const next = items.slice()
  next[i] = fn(items[i])
  return next
}

export function toolSummary(name: string, input: ClaudeMessage): string {
  const base = (p?: string) => (p ? p.split("/").pop() : "")
  switch (name) {
    case "Bash":
      return input.description || input.command || ""
    case "Read":
    case "Write":
    case "Edit":
      return base(input.file_path) ?? ""
    case "Agent":
    case "Task":
      return [input.subagent_type, input.description].filter(Boolean).join(" · ")
    case "WebSearch":
      return input.query ?? ""
    case "WebFetch":
      return input.url ?? ""
    case "Skill":
      return input.skill ?? ""
    case "Grep":
    case "Glob":
      return input.pattern ?? ""
    default:
      return ""
  }
}

function onMessage(state: ChatState, msg: ClaudeMessage): ChatState {
  const parent: string | null = msg.parent_tool_use_id ?? null

  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") return { ...state, sessionId: msg.session_id, model: msg.model }
      if (msg.subtype === "compact_boundary")
        return { ...state, items: [...state.items, { kind: "notice", id: uid("n"), text: "Đã nén ngữ cảnh hội thoại", tone: "info" }] }
      return state

    case "stream_event": {
      if (parent) return state
      const ev = msg.event
      if (ev.type === "message_start") return { ...state, streamMsg: ev.message?.id }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && state.streamMsg) {
        const id = `${state.streamMsg}:${ev.index}`
        const exists = state.items.some((it) => it.id === id)
        const items = exists
          ? update(state.items, id, (it) => (it.kind === "text" ? { ...it, text: it.text + ev.delta.text } : it))
          : [...state.items, { kind: "text" as const, id, msgId: state.streamMsg, text: ev.delta.text, streaming: true }]
        return { ...state, items }
      }
      return state
    }

    case "assistant": {
      const content: ClaudeMessage[] = msg.message?.content ?? []
      if (parent) {
        // Subagent step: count it on the parent tool card.
        const step = content.find((c) => c.type === "tool_use")
        if (!step) return state
        return {
          ...state,
          items: update(state.items, parent, (it) =>
            it.kind === "tool" ? { ...it, steps: it.steps + 1, lastStep: `${step.name} ${toolSummary(step.name, step.input)}` } : it,
          ),
        }
      }
      let items = state.items
      const msgId: string = msg.message?.id ?? uid("m")
      for (const c of content) {
        if (c.type === "text" && c.text?.trim()) {
          const draft = items.find((it) => it.kind === "text" && it.msgId === msgId && it.streaming)
          items = draft
            ? update(items, draft.id, (it) => ({ ...it, text: c.text, streaming: false }))
            : [...items, { kind: "text", id: uid("t"), msgId, text: c.text, streaming: false }]
        } else if (c.type === "tool_use" && c.name !== QUIZ_TOOL) {
          items = [...items, { kind: "tool", id: c.id, name: c.name, input: c.input ?? {}, status: "running", steps: 0 }]
        }
      }
      return { ...state, items }
    }

    case "user": {
      if (parent) return state
      const content = msg.message?.content
      if (!Array.isArray(content)) return state
      let items = state.items
      for (const c of content) {
        if (c.type !== "tool_result") continue
        items = update(items, c.tool_use_id, (it) => (it.kind === "tool" ? { ...it, status: c.is_error ? "error" : "done" } : it))
      }
      return { ...state, items }
    }

    case "control_request": {
      const req = msg.request
      if (req?.subtype !== "can_use_tool") return state
      const item: ChatItem =
        req.tool_name === QUIZ_TOOL
          ? { kind: "quiz", id: uid("q"), requestId: msg.request_id, input: req.input }
          : { kind: "permission", id: uid("p"), requestId: msg.request_id, tool: req.tool_name, input: req.input ?? {} }
      return { ...state, items: [...state.items, item] }
    }

    case "result": {
      // Any draft left streaming (interrupted turn) is final now.
      const items = state.items.map((it) => (it.kind === "text" && it.streaming ? { ...it, streaming: false } : it))
      items.push({ kind: "turn", id: uid("r"), durationMs: msg.duration_ms, costUsd: msg.total_cost_usd })
      if (msg.is_error && msg.subtype !== "success")
        items.push({ kind: "notice", id: uid("n"), text: `Lỗi: ${msg.subtype}`, tone: "error" })
      return { ...state, items, busy: false, streamMsg: undefined, sessionId: msg.session_id ?? state.sessionId }
    }

    default:
      return state
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "message":
      return onMessage(state, action.msg)
    case "send":
      return { ...state, busy: true, items: [...state.items, { kind: "user", id: uid("u"), text: action.text }] }
    case "answered":
      return {
        ...state,
        items: state.items.map((it) =>
          it.kind === "quiz" && it.requestId === action.requestId
            ? { ...it, answers: action.answers, picks: action.picks, skipped: action.skipped }
            : it,
        ),
      }
    case "decided":
      return {
        ...state,
        items: state.items.map((it) =>
          it.kind === "permission" && it.requestId === action.requestId ? { ...it, decision: action.decision } : it,
        ),
      }
    case "notice":
      return { ...state, items: [...state.items, { kind: "notice", id: uid("n"), text: action.text, tone: action.tone ?? "info" }] }
    case "stopped":
      return {
        ...state,
        busy: false,
        streamMsg: undefined,
        items: state.items.map((it) =>
          it.kind === "text" && it.streaming
            ? { ...it, streaming: false }
            : it.kind === "tool" && it.status === "running"
              ? { ...it, status: "error" }
              : it,
        ),
      }
    case "reset":
      return { ...initialChat, sessionId: action.sessionId }
  }
}
