import { memo, useEffect, useId, useState } from "react"
import type { Element, ElementContent } from "hast"
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { fileUrl } from "@/lib/ipc"
import { project } from "@/lib/project"
import { remarkCallouts, remarkWikilinks, WIKILINK_PROTOCOL } from "@/lib/remark-obsidian"
import { cn } from "@/lib/utils"

type Props = {
  text: string
  /** Directory (relative to the project) that relative image paths resolve against. */
  baseDir?: string
  className?: string
  onOpenNote?: (target: string) => void
}

const resolveEmbed = (target: string) =>
  // The visualize skill publishes every image into viz/; anything with a slash is project-relative.
  fileUrl(project.dir, target.includes("/") ? target : `viz/${target}`)

const remarkPlugins = [remarkGfm, remarkMath, remarkCallouts, [remarkWikilinks, { resolveEmbed }]] as const
const rehypePlugins = [rehypeKatex, [rehypeHighlight, { detect: false, plainText: ["mermaid"] }]] as const

function urlTransform(url: string) {
  if (url.startsWith(WIKILINK_PROTOCOL) || url.startsWith("asset:") || url.startsWith("http://asset.localhost")) return url
  return defaultUrlTransform(url)
}

function textOf(node: ElementContent | Element): string {
  if (node.type === "text") return node.value
  if ("children" in node) return node.children.map((c) => textOf(c as ElementContent)).join("")
  return ""
}

function isRemote(src: string) {
  return /^(https?:|data:|asset:|blob:)/.test(src)
}

export const Markdown = memo(function Markdown({ text, baseDir = "", className, onOpenNote }: Props) {
  const components: Components = {
    pre({ node, children, ...rest }) {
      const code = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code")
      const classes = (code?.properties.className as string[] | undefined) ?? []
      if (code && classes.includes("language-mermaid")) return <Mermaid code={textOf(code)} />
      return <pre {...rest}>{children}</pre>
    },
    img({ node: _node, src, ...rest }) {
      let url = typeof src === "string" ? src : ""
      if (url && !isRemote(url)) url = fileUrl(project.dir, baseDir ? `${baseDir}/${url}` : url)
      return <img {...rest} src={url} loading="lazy" />
    },
    a({ node: _node, href, children, ...rest }) {
      if (href?.startsWith(WIKILINK_PROTOCOL)) {
        const target = decodeURIComponent(href.slice(WIKILINK_PROTOCOL.length))
        return (
          <a
            {...rest}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onOpenNote?.(target)
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <a {...rest} href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
  }

  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        // react-markdown's plugin tuple types are stricter than the plugins' own.
        remarkPlugins={remarkPlugins as never}
        rehypePlugins={rehypePlugins as never}
        urlTransform={urlTransform}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

let mermaidReady: Promise<typeof import("mermaid").default> | null = null

function loadMermaid() {
  mermaidReady ??= import("mermaid").then((m) => m.default)
  return mermaidReady
}

function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/:/g, "")
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    loadMermaid().then(async (mermaid) => {
      const dark = document.documentElement.classList.contains("dark")
      mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" })
      try {
        const { svg } = await mermaid.render(`mmd-${id}`, code)
        if (alive) setSvg(svg)
      } catch {
        if (alive) setError(true)
      }
    })
    return () => {
      alive = false
    }
  }, [code, id])

  if (error) return <pre><code>{code}</code></pre>
  if (!svg) return <div className="mermaid-block text-sm text-muted-foreground">Đang vẽ sơ đồ…</div>
  return <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />
}

