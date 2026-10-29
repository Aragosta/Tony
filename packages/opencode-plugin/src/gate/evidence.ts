import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import type { ToolAfterEvent, ToolBeforeEvent } from "../host.ts"
import { fingerprint } from "../loop/fingerprint.ts"
import { resultText } from "../tool-result.ts"
import { isTestFile, patchFiles, tamperFindings } from "./tamper.ts"

export interface Failure {
  tool: string
  summary: string
}

export interface TurnEvidence {
  /** Relative to the session directory, sorted. */
  changedFiles: string[]
  /** Increments on every detected change. */
  changeSeq: number
  lastFailure?: Failure
  openTodos: string[]
  testTampering: string[]
}

interface Turn {
  changed: Set<string>
  changeSeq: number
  lastFailure?: Failure & { key: string }
  todos: string[]
  /** Test file content before this turn first changed it; null when it did not exist. */
  testBaselines: Map<string, string | null>
}

const MUTATIONS = new Set(["edit", "write", "patch"])
// Tony's own refusals: the model was already told what to do about them.
const OWN_REFUSALS = ["Blocked:", "Stopped:", "Edit refused:"]
// A failing shell command only counts when it looks like a check, not exploration (`grep` without a match).
const CHECK_WORDS = ["test", "build", "tsc", "lint", "check", "compile", "make", "cargo", "go ", "pytest", "jest", "vitest", "npm run", "bun run", "pnpm", "yarn"]
const SUMMARY_CHARS = 1500

const readOrNull = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null)

function toRelative(directory: string, path: string): string {
  return relative(directory, isAbsolute(path) ? path : resolve(directory, path))
}

/** Files a mutation call touches, relative to `directory`. */
function targets(tool: string, input: unknown, directory: string): string[] {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === "patch") return typeof i.patchText === "string" ? patchFiles(i.patchText).map((f) => toRelative(directory, f.path)) : []
  return typeof i.path === "string" ? [toRelative(directory, i.path)] : []
}

export class EvidenceTracker {
  private turns = new Map<string, Turn>()

  private turn(sessionID: string): Turn {
    let t = this.turns.get(sessionID)
    if (!t) {
      t = { changed: new Set(), changeSeq: 0, todos: [], testBaselines: new Map() }
      this.turns.set(sessionID, t)
    }
    return t
  }

  beginTurn(sessionID: string): void {
    this.turns.delete(sessionID)
  }

  async before(e: ToolBeforeEvent, directory: string): Promise<void> {
    if (!MUTATIONS.has(e.tool)) return
    const t = this.turn(e.sessionID)
    for (const path of targets(e.tool, e.input, directory)) {
      if (isTestFile(path) && !t.testBaselines.has(path)) t.testBaselines.set(path, readOrNull(resolve(directory, path)))
    }
  }

  after(e: ToolAfterEvent, directory: string): void {
    const t = this.turn(e.sessionID)
    const key = fingerprint(e.tool, e.input)
    if (e.status === "completed" && MUTATIONS.has(e.tool)) {
      for (const path of targets(e.tool, e.input, directory)) t.changed.add(path)
      t.changeSeq++
      t.lastFailure = undefined
      return
    }
    if (e.status === "completed" && e.tool === "todowrite") {
      const todos = ((e.input ?? {}) as { todos?: { content?: unknown; status?: unknown }[] }).todos ?? []
      t.todos = todos
        .filter((x) => x.status === "pending" || x.status === "in_progress")
        .map((x) => String(x.content))
    }
    const failure = this.failureOf(e)
    if (failure) t.lastFailure = { ...failure, key }
    else if (e.status === "completed" && t.lastFailure?.key === key) t.lastFailure = undefined
  }

  private failureOf(e: ToolAfterEvent): Failure | undefined {
    if (e.tool === "question") return undefined
    if (e.status === "error") {
      const message = e.error?.message ?? "unknown error"
      if (OWN_REFUSALS.some((p) => message.startsWith(p))) return undefined
      return { tool: e.tool, summary: message.slice(-SUMMARY_CHARS) }
    }
    if (e.tool !== "shell") return undefined
    const exit = e.result.metadata?.exit
    const command = String(((e.input ?? {}) as { command?: unknown }).command ?? "")
    if (typeof exit !== "number" || exit === 0 || !CHECK_WORDS.some((w) => command.includes(w))) return undefined
    const text = resultText(e) ?? ""
    return { tool: "shell", summary: `\`${command}\` exited with code ${exit}\n${text.slice(-SUMMARY_CHARS)}` }
  }

  addSnapshotFiles(sessionID: string, files: readonly string[]): void {
    const t = this.turn(sessionID)
    const fresh = files.filter((f) => !t.changed.has(f))
    if (fresh.length === 0) return
    for (const f of fresh) t.changed.add(f)
    t.changeSeq++
  }

  async evidence(sessionID: string, directory: string): Promise<TurnEvidence> {
    const t = this.turn(sessionID)
    const testTampering: string[] = []
    for (const path of [...t.changed].sort()) {
      if (!isTestFile(path)) continue
      const before = t.testBaselines.has(path) ? t.testBaselines.get(path)! : await this.headContent(path, directory)
      testTampering.push(...tamperFindings(path, before, readOrNull(resolve(directory, path))))
    }
    return {
      changedFiles: [...t.changed].sort(),
      changeSeq: t.changeSeq,
      ...(t.lastFailure ? { lastFailure: { tool: t.lastFailure.tool, summary: t.lastFailure.summary } } : {}),
      openTodos: t.todos,
      testTampering,
    }
  }

  /** Baseline for a test file changed without a tool call we saw (for example by a shell command). */
  private headContent(path: string, directory: string): Promise<string | null> {
    return new Promise((resolve) =>
      execFile("git", ["show", `HEAD:${path}`], { cwd: directory, maxBuffer: 16 * 1024 * 1024, timeout: 10000 }, (err, stdout) =>
        resolve(err ? null : stdout),
      ),
    )
  }
}
