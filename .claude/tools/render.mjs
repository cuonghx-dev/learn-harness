#!/usr/bin/env node
/**
 * render — turn a Mermaid or SVG source file into a PNG for the maker subagents
 * (mermaid-maker, svg-maker). Port of the pi visual-tools extension.
 *
 * Usage:
 *   node .claude/tools/render.mjs mermaid <source.mmd> [--save-as <slug>]
 *   node .claude/tools/render.mjs svg     <source.svg> [--save-as <slug>]
 *
 * Without --save-as: renders a preview PNG into the OS temp dir (NOT the vault)
 * and prints its path, so the agent can Read it and look at it.
 * With --save-as: also publishes the PNG into <project>/viz as
 * viz-<slug>-<timestamp>.png and prints filename + path.
 *
 * Mermaid renders through the bundled @mermaid-js/mermaid-cli (`mmdc`) using an
 * installed Chrome (no Chromium download). SVG renders through puppeteer with
 * the same Chrome, falling back to rsvg-convert if no Chrome is found.
 *
 * On failure: prints the error to stderr and exits 1.
 */

import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const MMDC_BIN = join(PROJECT_DIR, "node_modules", ".bin", "mmdc")
const STAGING_ROOT = join(tmpdir(), "learn-viz")
const FILES_DIRNAME = "viz"
const RENDER_TIMEOUT_MS = 120_000
const EXTRA_PATH = ["/opt/local/bin", "/usr/local/bin", "/opt/homebrew/bin"]

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean)

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c
  return undefined
}

/** An expected render failure: its message is the whole report, no stack. */
class RenderError extends Error {}

function fail(msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n")
  process.exit(1)
}

function run(cmd, args, { cwd, env } = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...(env ?? {}), PATH: [...EXTRA_PATH, process.env.PATH ?? ""].join(":") },
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, RENDER_TIMEOUT_MS)
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))
    child.on("error", (err) => {
      clearTimeout(timer)
      done({ code: null, stdout, stderr: stderr + String(err), timedOut })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      done({ code, stdout, stderr, timedOut })
    })
  })
}

async function renderMermaid(src, outPath, workDir) {
  if (!existsSync(MMDC_BIN)) fail(`mmdc not found at ${MMDC_BIN} — run \`npm install\` in ${PROJECT_DIR}.`)
  const chrome = findChrome()
  const cfgPath = join(workDir, "puppeteer.json")
  writeFileSync(
    cfgPath,
    JSON.stringify(chrome ? { executablePath: chrome, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] }),
  )
  const res = await run(MMDC_BIN, ["-i", src, "-o", outPath, "-p", cfgPath, "-s", "2", "-b", "white"], {
    cwd: workDir,
    env: { PUPPETEER_SKIP_DOWNLOAD: "1" },
  })
  if (res.code !== 0 || !existsSync(outPath)) {
    const detail = (res.stderr || res.stdout || "unknown error").split("\n").slice(-30).join("\n")
    fail(`${res.timedOut ? "mmdc timed out.\n\n" : ""}Mermaid render FAILED — no image produced. Fix the source and render again.\n\nError:\n${detail}`)
  }
}

async function renderSvg(src, outPath) {
  const chrome = findChrome()
  if (!chrome) {
    // No browser: fall back to rsvg-convert (librsvg), -z 2 for a crisp raster.
    const res = await run("rsvg-convert", ["-z", "2", src, "-o", outPath])
    if (res.code === 0 && existsSync(outPath)) return
    fail(`SVG render FAILED — no Chrome found and rsvg-convert failed.\n\nError:\n${res.stderr || res.stdout}`)
  }

  let puppeteer
  try {
    // puppeteer-core ships with mermaid-cli; resolve it from the project, not this file.
    const entry = createRequire(join(PROJECT_DIR, "package.json")).resolve("puppeteer-core")
    puppeteer = (await import(pathToFileURL(entry).href)).default
  } catch (err) {
    fail(`puppeteer not found — run \`npm install\` in ${PROJECT_DIR}.\n\n${err}`)
  }

  const svg = readFileSync(src, "utf8")
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:white">${svg}</body></html>`,
      { waitUntil: "load" },
    )
    const box = await page.evaluate(() => {
      const el = document.querySelector("svg")
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { width: Math.ceil(r.width), height: Math.ceil(r.height) }
    })
    // Throw rather than fail() so the finally block closes the browser.
    if (!box) throw new RenderError("SVG render FAILED — no <svg> element found in the source.")
    if (box.width === 0 || box.height === 0) {
      throw new RenderError("SVG render FAILED — the <svg> has zero size. Set explicit width/height (or a viewBox plus width/height).")
    }
    await page.setViewport({ width: box.width, height: box.height, deviceScaleFactor: 2 })
    const el = await page.$("svg")
    await el.screenshot({ path: outPath, omitBackground: false })
    if (errors.length) process.stderr.write(`Browser warnings:\n${errors.join("\n")}\n`)
  } finally {
    await browser.close()
  }
}

/** Copy a rendered PNG into <project>/viz with a unique, slugified name. */
function publish(pngPath, slug) {
  const filesDir = join(PROJECT_DIR, FILES_DIRNAME)
  mkdirSync(filesDir, { recursive: true })
  const clean =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "viz"
  const filename = `viz-${clean}-${Date.now()}.png`
  const dest = join(filesDir, filename)
  copyFileSync(pngPath, dest)
  return { filename, path: dest }
}

async function main() {
  const [kind, srcArg, ...rest] = process.argv.slice(2)
  if (!["mermaid", "svg"].includes(kind) || !srcArg) {
    fail("Usage: node .claude/tools/render.mjs <mermaid|svg> <source-file> [--save-as <slug>]")
  }
  const src = resolve(srcArg)
  if (!existsSync(src)) fail(`Source file not found: ${src}`)

  let saveAs
  const i = rest.indexOf("--save-as")
  if (i !== -1) {
    saveAs = rest[i + 1]
    if (!saveAs) fail("--save-as needs a short kebab-case slug, e.g. --save-as internet-packets")
  }

  const workDir = join(STAGING_ROOT, kind)
  mkdirSync(workDir, { recursive: true })
  // pid + random suffix: parallel makers can render in the same millisecond.
  const outPath = join(workDir, `render-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.png`)

  if (kind === "mermaid") await renderMermaid(src, outPath, workDir)
  else await renderSvg(src, outPath)

  if (saveAs) {
    const { filename, path } = publish(outPath, saveAs)
    console.log(`Published to viz/.\nfilename: ${filename}\npath: ${path}\n\nRead ${path} and LOOK at it to confirm it is correct before returning it.`)
  } else {
    console.log(`Preview render (not yet saved): ${outPath}\n\nRead it and LOOK: is everything correct, labeled right, nothing cramped or clipped? Fix the source and re-render, or re-render with --save-as <slug> to publish.`)
  }
}

main().catch((err) => fail(err instanceof RenderError ? err.message : `Render FAILED: ${err?.stack || err}`))
