import { toolSummary, type ChatItem } from "@/lib/chat"
import { cn } from "@/lib/utils"

type Permission = Extract<ChatItem, { kind: "permission" }>

const DECIDED = { allow: "Đã cho phép", always: "Luôn cho phép trong session này", deny: "Đã từ chối" }

/** What the tool would do, in one line under the command. */
function impact(perm: Permission): string | null {
  const file: string | undefined = perm.input.file_path ?? perm.input.notebook_path
  switch (perm.tool) {
    case "Write":
      return file ? `Ghi file mới: ${file}` : null
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return file ? `Sửa file: ${file}` : null
    case "Bash":
      return perm.input.description ? String(perm.input.description) : null
    default:
      return null
  }
}

/** A tool that changes something (Bash, Write, Edit, ...) waiting for the learner's OK. */
export function PermissionCard({ perm, onDecide }: { perm: Permission; onDecide: (d: "allow" | "always" | "deny") => void }) {
  const isBash = perm.tool === "Bash"
  const detail: string = isBash
    ? (perm.input.command ?? "")
    : perm.tool === "Write"
      ? (perm.input.content ?? "")
      : perm.tool === "Edit"
        ? (perm.input.new_string ?? "")
        : toolSummary(perm.tool, perm.input) || JSON.stringify(perm.input, null, 2)
  const pending = !perm.decision
  const effect = impact(perm)

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl p-3.5",
        pending ? "border-[1.5px] border-perm-border bg-perm-bg" : "border border-perm-code-border bg-perm-bg/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-perm-border text-[11px] font-bold text-white">!</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-perm-text">
          {isBash ? "Claude muốn chạy lệnh" : "Claude muốn sửa file"}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-[#8a6a1e]">{perm.tool}</span>
      </div>
      {detail && (
        <pre className="max-h-40 overflow-auto rounded-[7px] border border-perm-code-border bg-perm-code-bg px-[11px] py-[9px] font-mono text-[12.5px] leading-normal break-all whitespace-pre-wrap text-ink-2 select-text">
          {detail}
        </pre>
      )}
      {effect && <p className="text-[12px] break-all text-perm-muted">{effect}</p>}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onDecide("allow")}
            className="h-[30px] rounded-[7px] bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-ink/90"
          >
            Cho phép
          </button>
          <button
            onClick={() => onDecide("always")}
            className="h-[30px] rounded-[7px] border border-[#e2cf9a] bg-white px-3 text-[12.5px] text-perm-text hover:bg-perm-code-bg"
          >
            Luôn cho phép {perm.tool}
          </button>
          <button onClick={() => onDecide("deny")} className="h-[30px] rounded-[7px] px-3 text-[12.5px] text-perm-muted hover:bg-perm-code-bg">
            Từ chối
          </button>
        </div>
      ) : (
        <div className="text-[12px] text-perm-muted">{DECIDED[perm.decision!]}</div>
      )}
    </div>
  )
}
