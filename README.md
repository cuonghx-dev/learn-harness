# learn

[![video](assets/thumbnail.png)](https://www.youtube.com/watch?v=kzcI5F4tGiU)

An AI learning system for [Claude Code](https://claude.com/claude-code), ported from [amosblomqvist/learn](https://github.com/amosblomqvist/learn) (originally a [pi](https://github.com/earendil-works/pi) configuration) — see the video [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU).

Claude teaches like a tutor: it probes what you already know with graded quizzes, plans the lesson as a dependency map from unconditional truths up to your goal, then teaches node by node (motivate → establish → connect → quiz-check). It verifies facts with a researcher subagent and draws diagrams when a picture is clearer. Lessons are taught in Vietnamese.

## What's in it

- `.claude/skills/teach/` — the philosophy and the process (probe → plan → teach), plus the quiz protocol
- `.claude/skills/visualize/` — adds a correct, minimal diagram to a lesson when an idea is clearer as a picture
- `.claude/agents/` — subagents: `researcher` (web fact-checking), `mermaid-maker`, `svg-maker` (render, look, iterate, publish PNG to `viz/`)
- `.claude/tools/render.mjs` — renders Mermaid/SVG to PNG with your installed Chrome
- `.claude/hooks/md-log.mjs` + `/md-log`, `/md-unlog` — mirror the session into a markdown file for reading in Obsidian
- `.claude/settings.json` — registers the md-log hooks

Quizzes use Claude Code's built-in `AskUserQuestion` popup: up to 3 answers plus `Tôi không biết`; Claude grades ✓/✗ with the correct answer and an explanation right after you answer.

## Requirements

- Claude Code
- Node.js 18+
- Google Chrome (or Chromium; set `CHROME_PATH` if it's somewhere unusual) — used to render diagrams
- [Obsidian](https://obsidian.md) to read lessons (renders LaTeX, mermaid, and `![[viz-…png]]` embeds)

## Install

Clone this repo into a folder named `learn`, then:

```bash
cd learn
PUPPETEER_SKIP_DOWNLOAD=1 npm install
```

Open the `learn` folder in Obsidian as a vault (*Open folder as vault*).

## Learn something

```bash
cd learn
claude
```

Then in Claude Code:

```
/md-log notes/tcp-ip.md
Dạy tôi TCP/IP hoạt động thế nào
```

1. **Probe** — answer the quizzes honestly (`Tôi không biết` is fine — it's data), then say what you want to be able to do.
2. **Plan** — Claude shows the approach and a mermaid dependency map, then waits. Push back on wrong roots or scope, then say go.
3. **Teach** — read along in `notes/tcp-ip.md` in Obsidian; answer quizzes in the terminal.

`/md-unlog` stops logging. Tired? Say "giảng luôn, đừng hỏi nhiều" and Claude switches to narrating.

## Desktop app

Prefer a window over terminal + Obsidian? `app/` is a Tauri app that shows lessons, chat with Claude, clickable quiz cards and a record button in one place — see [app/README.md](app/README.md).

## Notes

- If a subagent fails (no network, no Chrome), the main session still teaches; you only lose fact-checking or generated visuals.
- Lesson files (`notes/`), images (`viz/`), and Obsidian settings are gitignored — they're yours, not the system's.
- The teaching skill was written for one learner. Edit `.claude/skills/teach/SKILL.md` to fit how you learn.
