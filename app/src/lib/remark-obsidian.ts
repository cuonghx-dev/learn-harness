// Obsidian syntax the lesson logs use, as remark plugins:
//   > [!type] Title          callouts (md-log writes YOU/CLAUDE headers, quizzes, answers)
//   ![[viz-x.png|500]]       embeds (the visualize skill publishes PNGs into viz/)
//   [[note]] / [[note|alias]] wikilinks
import { findAndReplace } from "mdast-util-find-and-replace"
import type { Blockquote, Image, Link, PhrasingContent, Root, RootContent } from "mdast"
import { visit } from "unist-util-visit"

const CALLOUT = /^\[!([\w-]+)\][+-]?[ \t]*(.*)$/

/** md-log's bodyless speaker headers, by title. */
const SPEAKERS: Record<string, string> = { YOU: "Bạn", CLAUDE: "Claude" }

function isHeader(node: RootContent | undefined) {
  const cls = (node?.data?.hProperties as { className?: string[] } | undefined)?.className
  return node?.type === "blockquote" && !!cls?.includes("callout-header")
}

export function remarkCallouts() {
  return (tree: Root) => {
    const youHeaders = new Set<Blockquote>()
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0]
      if (first?.type !== "paragraph") return
      const head = first.children[0]
      if (head?.type !== "text") return
      const nl = head.value.indexOf("\n")
      const m = CALLOUT.exec(nl === -1 ? head.value : head.value.slice(0, nl))
      if (!m) return

      const type = m[1].toLowerCase()
      let title: PhrasingContent[]
      if (nl === -1) {
        // The whole first paragraph is the title line.
        title = [{ type: "text", value: m[2] }, ...first.children.slice(1)]
        node.children.shift()
      } else {
        title = [{ type: "text", value: m[2] }]
        head.value = head.value.slice(nl + 1)
      }
      const hasTitle = title.some((c) => c.type !== "text" || c.value.trim())
      if (!hasTitle) title = [{ type: "text", value: type }]

      node.children.unshift({
        type: "paragraph",
        children: title,
        data: { hName: "div", hProperties: { className: ["callout-title"] } },
      })
      const bodyless = node.children.length === 1
      const speaker = bodyless ? SPEAKERS[textOf(title).trim()] : undefined
      if (speaker) {
        node.children[0] = { ...node.children[0], children: [{ type: "text", value: speaker }] } as typeof first
        if (speaker === SPEAKERS.YOU) youHeaders.add(node)
      }
      node.data = {
        hName: "div",
        hProperties: { className: ["callout", ...(bodyless ? ["callout-header"] : [])], "data-callout": type },
      }
    })

    // A learner's turn (YOU header up to the next speaker header) reads as one dialogue block.
    if (youHeaders.size === 0) return
    const out: RootContent[] = []
    const kids = tree.children
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i]
      if (!(node.type === "blockquote" && youHeaders.has(node))) {
        out.push(node)
        continue
      }
      const group: RootContent[] = [node]
      while (i + 1 < kids.length && !isHeader(kids[i + 1])) group.push(kids[++i])
      out.push({
        type: "blockquote",
        children: group as Blockquote["children"],
        data: { hName: "div", hProperties: { className: ["dialogue"] } },
      })
    }
    tree.children = out
  }
}

function textOf(nodes: PhrasingContent[]): string {
  return nodes.map((n) => ("value" in n ? n.value : "children" in n ? textOf(n.children as PhrasingContent[]) : "")).join("")
}

export const WIKILINK_PROTOCOL = "wikilink:"

export function remarkWikilinks(options: { resolveEmbed: (target: string) => string }) {
  return (tree: Root) => {
    findAndReplace(tree, [
      [
        /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_: string, target: string, size?: string): Image => {
          const [w, h] = (size ?? "").split("x").map((n) => Number.parseInt(n, 10))
          return {
            type: "image",
            url: options.resolveEmbed(target.trim()),
            alt: target.trim(),
            data: { hProperties: { ...(w ? { width: w } : {}), ...(h ? { height: h } : {}) } },
          }
        },
      ],
      [
        /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_: string, target: string, alias?: string): Link => ({
          type: "link",
          url: WIKILINK_PROTOCOL + encodeURIComponent(target.trim()),
          children: [{ type: "text", value: (alias ?? target).trim() }],
        }),
      ],
    ])
  }
}
