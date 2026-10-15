#!/usr/bin/env node
/**
 * md-log — mirror the Claude Code session to a markdown file for comfortable
 * reading. Port of the pi md-log extension.
 *
 * Designed for long teaching/learning sessions where the terminal is hard on
 * the eyes and markdown/math/code don't render. The linked .md file is meant
 * to be viewed rendered (e.g. in Obsidian), so assistant text with $...$ math,
 * code blocks, mermaid and ![[viz-...png]] embeds all render natively.
 *
 * Captures only reading-relevant content:
 *   - user prompts
 *   - assistant text (lesson prose, including quiz feedback)
 *   - AskUserQuestion Q&A blocks
 * Other tools (Bash, Read, Edit, Agent, ...) are omitted.
 *
 * Questions are written BEFORE the user answers (PreToolUse), so the reader
 * sees them appear live; answers are appended right after (PostToolUse).
 * Correct answers never appear in the question block — Claude reveals them in
 * its text after the user answers.
 *
 * Subcommands (state lives in <project>/.claude/state/md-log.json):
 *   link <file>   — link a markdown file (created if missing) and backfill the session
 *   unlink        — stop logging
 *   session       — hook SessionStart/UserPromptSubmit: remember the transcript path
 *   pre-ask       — hook PreToolUse(AskUserQuestion): flush, then write the question
 *   flush         — hook PostToolUse(AskUserQuestion): append new transcript content
 *   flush-later   — hook Stop: detached flush once the transcript stops growing
 *
 * Hooks read their JSON input from stdin and never fail the session: any error
 * is swallowed so a logging problem can't block Claude.
 */

import { spawn } from "node:child_process"
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const STATE_FILE = join(PROJECT_DIR, ".claude", "state", "md-log.json")
const LOCK_FILE = STATE_FILE + ".lock"
const QA_TOOL = "AskUserQuestion"
const MAX_CURSORS = 20

// Built-in commands that are session plumbing, not lesson content.
const SKIP_COMMANDS = new Set(["/clear", "/compact", "/resume", "/model", "/config", "/context", "/cost", "/status", "/help"])

// --- State ---
//
// One linked file, but a read cursor per transcript: several sessions can run
// in the same project, and switching between them must not re-read a
// transcript from the start.

function loadState() {
	let state
	try {
		state = JSON.parse(readFileSync(STATE_FILE, "utf8"))
	} catch {
		state = {}
	}
	return { file: state.file ?? null, transcript: state.transcript ?? null, cursors: state.cursors ?? {} }
}

function saveState(state) {
	mkdirSync(dirname(STATE_FILE), { recursive: true })
	// Keep the asked-id lists short; ids only matter within the current turn.
	for (const c of Object.values(state.cursors)) c.asked = (c.asked ?? []).slice(-50)
	// Keep the most recently used transcripts only.
	const keys = Object.keys(state.cursors)
	for (const k of keys.slice(0, Math.max(0, keys.length - MAX_CURSORS))) delete state.cursors[k]
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n")
}

/** The read cursor of the current transcript (created on first use, moved to most-recent). */
function cursor(state) {
	const key = state.transcript
	const c = state.cursors[key] ?? { offset: 0, asked: [] }
	c.asked ??= []
	delete state.cursors[key]
	state.cursors[key] = c
	return c
}

/**
 * Run `fn(state)` holding an exclusive lock on the state file, then save.
 * Hooks and the detached Stop flush run concurrently; without the lock they
 * overwrite each other's offsets and the log gets duplicated or loses blocks.
 */
async function withState(fn, timeoutMs = 5000) {
	mkdirSync(dirname(LOCK_FILE), { recursive: true })
	const end = Date.now() + timeoutMs
	let fd
	while (fd === undefined) {
		try {
			fd = openSync(LOCK_FILE, "wx")
		} catch (err) {
			if (err.code !== "EEXIST") throw err
			// A crashed holder leaves the lock behind; treat old locks as stale.
			try {
				if (Date.now() - statSync(LOCK_FILE).mtimeMs > 30_000) unlinkSync(LOCK_FILE)
			} catch {}
			if (Date.now() > end) throw new Error("state lock timed out")
			await sleep(50)
		}
	}
	try {
		const state = loadState()
		const result = fn(state)
		saveState(state)
		return result
	} finally {
		closeSync(fd)
		try {
			unlinkSync(LOCK_FILE)
		} catch {}
	}
}

function readStdin() {
	try {
		const raw = readFileSync(0, "utf8")
		return raw.trim() ? JSON.parse(raw) : {}
	} catch {
		return {}
	}
}

// --- Formatting ---

function appendToFile(file, text) {
	let current = ""
	if (existsSync(file)) current = readFileSync(file, "utf8")
	const prefix = current.trim().length > 0 ? "\n\n" : ""
	appendFileSync(file, prefix + text + "\n", "utf8")
}

function callout(type, title, bodyLines) {
	const lines = [`> [!${type}] ${title}`]
	for (const line of bodyLines) lines.push(line.length === 0 ? ">" : `> ${line}`)
	return lines.join("\n")
}

function userBlock(text) {
	return `> [!quote] YOU\n\n${text}`
}

function assistantBlock(text) {
	return `> [!abstract] CLAUDE\n\n${text}`
}

// System-injected context, not user prose. Skill bodies collapse into a compact
// note; reminders and slash-command plumbing are dropped.
function cleanUserText(text) {
	let t = text
		.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
		.replace(/<local-command-[a-z]+>[\s\S]*?<\/local-command-[a-z]+>/g, "")
	const cmd = /<command-name>([^<]*)<\/command-name>/.exec(t)
	if (cmd) {
		if (SKIP_COMMANDS.has(cmd[1].trim())) return ""
		const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t)?.[1]?.trim()
		t = `${cmd[1].trim()}${args ? " " + args : ""}`
	}
	return t.trim()
}

function questionBlocks(input) {
	const questions = Array.isArray(input?.questions) ? input.questions : []
	return questions.map((q) => {
		const body = [...String(q.question ?? "").split("\n")]
		const options = Array.isArray(q.options) ? q.options : []
		if (options.length > 0) {
			body.push("")
			options.forEach((o, i) => body.push(`${i + 1}. ${o.label}`))
		}
		if (q.multiSelect) body.push("", "_(chọn nhiều)_")
		return callout("question", q.header ? `Câu hỏi — ${q.header}` : "Câu hỏi", body)
	})
}

function answerBlock(result) {
	const answers = result?.answers && typeof result.answers === "object" ? result.answers : null
	if (!answers || Object.keys(answers).length === 0) {
		return callout("warning", "Trả lời — bỏ qua", ["(người học không trả lời)"])
	}
	const body = []
	for (const [question, answer] of Object.entries(answers)) {
		if (Object.keys(answers).length > 1) body.push(`**${question}**`)
		for (const line of String(answer).split("\n")) body.push(line)
		const notes = result?.annotations?.[question]?.notes
		if (notes) body.push(`Ghi chú: ${notes}`)
		body.push("")
	}
	while (body.length && body[body.length - 1] === "") body.pop()
	return callout("example", "Trả lời", body)
}

// --- Transcript processing ---

/** Read complete JSONL lines from byte `offset`; return entries and the new offset. */
function readNewEntries(transcript, offset) {
	if (!transcript || !existsSync(transcript)) return { entries: [], offset }
	const fd = openSync(transcript, "r")
	try {
		const size = fstatSync(fd).size
		if (offset > size) offset = 0 // transcript was replaced
		const buf = Buffer.alloc(size - offset)
		readSync(fd, buf, 0, buf.length, offset)
		const lastNl = buf.lastIndexOf(0x0a)
		if (lastNl === -1) return { entries: [], offset }
		const entries = []
		for (const line of buf.subarray(0, lastNl).toString("utf8").split("\n")) {
			if (!line.trim()) continue
			try {
				entries.push(JSON.parse(line))
			} catch {
				// partial or corrupt line; skip
			}
		}
		return { entries, offset: offset + lastNl + 1 }
	} finally {
		closeSync(fd)
	}
}

/** Turn transcript entries into markdown blocks. Mutates `asked`. */
function entriesToBlocks(entries, asked) {
	const blocks = []
	let assistantText = []
	const flushAssistant = () => {
		if (assistantText.length) blocks.push(assistantBlock(assistantText.join("\n\n")))
		assistantText = []
	}

	for (const e of entries) {
		if (e.isSidechain) continue // subagent traffic
		const content = e.message?.content

		if (e.type === "assistant" && Array.isArray(content)) {
			for (const c of content) {
				if (c.type === "text" && c.text?.trim()) assistantText.push(c.text.trim())
				if (c.type === "tool_use" && c.name === QA_TOOL && !asked.includes(c.id)) {
					flushAssistant()
					blocks.push(...questionBlocks(c.input))
					asked.push(c.id)
				}
			}
			continue
		}

		if (e.type === "user") {
			if (e.toolUseResult && typeof e.toolUseResult === "object" && "answers" in e.toolUseResult) {
				flushAssistant()
				blocks.push(answerBlock(e.toolUseResult))
				continue
			}
			if (e.isMeta || e.isCompactSummary) continue
			const text = typeof content === "string"
				? content
				: Array.isArray(content)
					? content.filter((c) => c.type === "text").map((c) => c.text).join("\n")
					: ""
			const cleaned = cleanUserText(text)
			if (!cleaned) continue
			flushAssistant()
			blocks.push(userBlock(cleaned))
		}
	}
	flushAssistant()
	return blocks
}

// Claude Code appends to the transcript asynchronously, so a hook can fire
// before the content it's about is on disk. These waits close that gap.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Wait until the transcript past byte `offset` contains `needle` (max `timeoutMs`). */
async function waitForText(transcript, needle, offset = 0, timeoutMs = 5000) {
	const end = Date.now() + timeoutMs
	while (Date.now() < end) {
		try {
			const fd = openSync(transcript, "r")
			try {
				const size = fstatSync(fd).size
				const start = offset > size ? 0 : offset
				const buf = Buffer.alloc(size - start)
				readSync(fd, buf, 0, buf.length, start)
				if (buf.includes(needle)) return
			} finally {
				closeSync(fd)
			}
		} catch {
			return
		}
		await sleep(100)
	}
}

/** Wait until the transcript stops growing for `quietMs` (max `timeoutMs`). */
async function waitForQuiet(transcript, quietMs = 1000, timeoutMs = 10000) {
	const end = Date.now() + timeoutMs
	let last = -1
	let stableSince = Date.now()
	while (Date.now() < end) {
		let size
		try {
			size = statSync(transcript).size
		} catch {
			return
		}
		if (size !== last) {
			last = size
			stableSince = Date.now()
		} else if (Date.now() - stableSince >= quietMs) {
			return
		}
		await sleep(150)
	}
}

function flush(state) {
	if (!state.file || !state.transcript) return 0
	const c = cursor(state)
	const { entries, offset } = readNewEntries(state.transcript, c.offset ?? 0)
	c.offset = offset
	const blocks = entriesToBlocks(entries, c.asked)
	if (blocks.length) appendToFile(state.file, blocks.join("\n\n"))
	return blocks.length
}

// --- Commands ---

function link(arg, state) {
	const filepath = (arg ?? "").trim()
	if (!filepath) return "Usage: /md-log <filepath>"
	if (!state.transcript) return "Chưa biết transcript của session — gửi một tin nhắn bất kỳ rồi chạy lại /md-log."
	const resolved = isAbsolute(filepath) ? filepath : resolve(PROJECT_DIR, filepath)
	if (existsSync(resolved) && !statSync(resolved).isFile()) return `Not a file: ${resolved}`
	mkdirSync(dirname(resolved), { recursive: true })
	if (!existsSync(resolved)) writeFileSync(resolved, "")

	state.file = resolved
	// Cursors of other transcripts point into the previous file; start over.
	state.cursors = {}
	const written = flush(state)
	return `Linked: ${relative(PROJECT_DIR, resolved) || resolved} (${written} blocks backfilled)`
}

async function main() {
	const [sub, ...rest] = process.argv.slice(2)

	// Stop: hand off to a detached process so the session isn't held up while
	// we wait for the final assistant message to land in the transcript.
	if (sub === "flush-later") {
		readStdin()
		if (!loadState().file) return
		spawn(process.execPath, [fileURLToPath(import.meta.url), "flush-settled"], {
			detached: true,
			stdio: "ignore",
			env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
		}).unref()
		return
	}
	// Waits happen before taking the lock so other hooks aren't held up.
	const input = ["session", "pre-ask", "flush"].includes(sub) ? readStdin() : {}
	if (sub === "flush-settled") {
		const { file, transcript } = loadState()
		if (!file || !transcript) return
		await waitForQuiet(transcript)
	}
	if (sub === "pre-ask") {
		const { file, transcript, cursors } = loadState()
		if (!file) return
		// Flush the prose that leads up to the question first, so it stays above it.
		if (input.tool_use_id && transcript) await waitForText(transcript, input.tool_use_id, cursors[transcript]?.offset ?? 0)
	}

	switch (sub) {
		case "link":
			console.log(await withState((state) => link(rest.join(" "), state)))
			break
		case "unlink":
			console.log(
				await withState((state) => {
					const name = state.file ? relative(PROJECT_DIR, state.file) : null
					flush(state)
					state.file = null
					return name ? `Unlinked: ${name}` : "No file linked"
				}),
			)
			break
		case "session":
			// Keep the link across sessions; each transcript has its own cursor,
			// so a new one is logged from its start and a known one resumes.
			if (input.transcript_path) await withState((state) => void (state.transcript = input.transcript_path))
			break
		case "pre-ask":
			await withState((state) => {
				if (!state.file) return
				flush(state)
				const asked = state.transcript ? cursor(state).asked : []
				const id = input.tool_use_id
				if (!id || !asked.includes(id)) {
					appendToFile(state.file, questionBlocks(input.tool_input).join("\n\n"))
					if (id) asked.push(id)
				}
			})
			break
		case "flush":
		case "flush-settled":
			await withState(flush)
			break
		default:
			console.error("Usage: md-log.mjs <link <file>|unlink|session|pre-ask|flush>")
			process.exit(1)
	}
}

main().catch((err) => {
	// Never block the session because of logging.
	console.error(`md-log: ${err?.message || err}`)
	process.exit(0)
})
