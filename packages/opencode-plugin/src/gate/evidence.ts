import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import type { ToolAfterEvent, ToolBeforeEvent } from "../host.ts"
import { fingerprint } from "../loop/fingerprint.ts"
import { resultText } from "../tool-result.ts"
import { normalizeCheck } from "../verify/detect.ts"
import { isTestFile, patchFiles, tamperFindings } from "./tamper.ts"

export interface Failure {
  tool: string
  summary: string
  /** The failing call's fingerprint: the same call failing again is the same failure. */
  key: string
}

export interface TurnEvidence {
  /** Relative to the session directory, sorted. */
  changedFiles: string[]
  /** Increments on every detected change. */
  changeSeq: number
  lastFailure?: Failure
  openTodos: string[]
  testTampering: string[]
  /** Check commands (normalized) the agent itself ran successfully after its last change. */
  passedChecks: string[]
}

interface Turn {
  changed: Set<string>
  changeSeq: number
  lastFailure?: Failure
  todos: string[]
  passed: Set<string>
  /** Test file content before this turn first changed it; null when it did not exist. */
  testBaselines: Map<string, string | null>
}

const MUTATIONS = new Set(["edit", "write", "patch"])
// Loop-guard refusals: the model already has the earlier result. An edit refusal does count: the edit never happened.
const OWN_REFUSALS = ["Blocked:", "Stopped:"]
// Lookups that fail are exploration (a file that isn't there), not a broken result.
const LOOKUPS = new Set(["read", "glob", "grep", "list", "webfetch", "websearch", "question"])
// A failing shell command counts only when one of its commands runs a build, test or lint tool.
const RUNNERS = new Set(["npm", "pnpm", "yarn", "bun", "bunx", "npx", "deno", "tsc", "eslint", "biome", "ruff", "mypy", "pyright", "pytest", "jest", "vitest", "mocha", "cargo", "go", "make", "gradle", "gradlew", "mvn", "dotnet", "tox", "nox"])
const PYTHON_CHECKS = new Set(["pytest", "unittest", "mypy", "ruff", "tox", "compileall"])
const SUMMARY_CHARS = 1500

/** True when a segment of `command` starts with a check runner: `cd x && bun test` yes, `grep -rn test src` no. */
export function runsCheck(command: string): boolean {
  return command.split(/&&|\|\||[;|\n]/).some((segment) => {
    const words = segment.trim().split(/\s+/).filter((w) => w.length > 0 && !/^\w+=/.test(w))
    const first = (words[0] ?? "").replace(/^.*\//, "")
    if (/^python3?$/.test(first)) return words.some((w) => PYTHON_CHECKS.has(w))
    return RUNNERS.has(first)
  })
}

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
      t = { changed: new Set(), changeSeq: 0, todos: [], passed: new Set(), testBaselines: new Map() }
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
      t.passed.clear()
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
    if (failure) t.lastFailure = failure
    else if (e.status === "completed" && t.lastFailure?.key === key) t.lastFailure = undefined
    if (e.status === "completed" && e.tool === "shell" && e.result.metadata?.exit === 0) {
      const command = String(((e.input ?? {}) as { command?: unknown }).command ?? "")
      if (runsCheck(command)) t.passed.add(normalizeCheck(command))
    }
  }

  /** A call another hook refused. opencode fires no after-hook for it, so the refusing hook reports it here. */
  refused(e: ToolBeforeEvent, message: string): void {
    this.turn(e.sessionID).lastFailure = { tool: e.tool, summary: message.slice(-SUMMARY_CHARS), key: fingerprint(e.tool, e.input) }
  }

  private failureOf(e: ToolAfterEvent): Failure | undefined {
    if (LOOKUPS.has(e.tool)) return undefined
    const key = fingerprint(e.tool, e.input)
    if (e.status === "error") {
      const message = e.error?.message ?? "unknown error"
      if (OWN_REFUSALS.some((p) => message.startsWith(p))) return undefined
      return { tool: e.tool, summary: message.slice(-SUMMARY_CHARS), key }
    }
    if (e.tool !== "shell") return undefined
    const exit = e.result.metadata?.exit
    const command = String(((e.input ?? {}) as { command?: unknown }).command ?? "")
    if (typeof exit !== "number" || exit === 0 || !runsCheck(command)) return undefined
    const text = resultText(e) ?? ""
    return { tool: "shell", summary: `\`${command}\` exited with code ${exit}\n${text.slice(-SUMMARY_CHARS)}`, key }
  }

  addSnapshotFiles(sessionID: string, files: readonly string[]): void {
    const t = this.turn(sessionID)
    const fresh = files.filter((f) => !t.changed.has(f))
    if (fresh.length === 0) return
    for (const f of fresh) t.changed.add(f)
    t.changeSeq++
    t.passed.clear()
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
      ...(t.lastFailure ? { lastFailure: { ...t.lastFailure } } : {}),
      openTodos: t.todos,
      testTampering,
      passedChecks: [...t.passed].sort(),
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
