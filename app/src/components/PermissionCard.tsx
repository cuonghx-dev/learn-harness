import { ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toolSummary, type ChatItem } from "@/lib/chat"
import { cn } from "@/lib/utils"

type Permission = Extract<ChatItem, { kind: "permission" }>

const DECIDED = { allow: "Đã cho phép", always: "Luôn cho phép trong session này", deny: "Đã từ chối" }

/** A tool that changes something (Bash, Write, Edit, ...) waiting for the learner's OK. */
export function PermissionCard({ perm, onDecide }: { perm: Permission; onDecide: (d: "allow" | "always" | "deny") => void }) {
  const detail: string = perm.tool === "Bash" ? (perm.input.command ?? "") : (perm.input.file_path ?? toolSummary(perm.tool, perm.input))
  const pending = !perm.decision

  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-sm shadow-sm",
        pending && "border-amber-500/50 ring-4 ring-amber-500/10",
      )}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 text-[11px] font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
        <ShieldAlert className="size-3.5" />
        Claude muốn dùng {perm.tool}
      </div>
      {perm.tool === "Bash" && perm.input.description && <p className="px-3.5 pt-1.5 text-muted-foreground">{perm.input.description}</p>}
      {detail && (
        <pre className="mx-3.5 mt-2 max-h-40 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-all">
          {detail}
        </pre>
      )}
      {pending ? (
        <div className="flex flex-wrap items-center justify-end gap-2 px-3.5 py-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onDecide("deny")}>
            Từ chối
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDecide("always")}>
            Luôn cho phép {perm.tool}
          </Button>
          <Button size="sm" onClick={() => onDecide("allow")}>
            Cho phép
          </Button>
        </div>
      ) : (
        <div className="px-3.5 py-2.5 text-xs text-muted-foreground">{DECIDED[perm.decision!]}</div>
      )}
    </div>
  )
}
