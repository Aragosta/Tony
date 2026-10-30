import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import type { ToolAfterEvent, ToolBeforeEvent } from "../../host.ts"
import { fingerprint } from "../loop/fingerprint.ts"
import { resultText } from "../../tool-result.ts"
import { toPosix } from "../../platform.ts"
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
  /** The check (normalized) the agent ran successfully as its latest action that could change files; at most one. */
  passedChecks: string[]
  /** Edits another hook refused, per file, that no later completed edit of that file made up for. */
  refusedEdits: RefusedEdit[]
}

export interface RefusedEdit {
  path: string
  message: string
}

interface Turn {
  changed: Set<string>
  changeSeq: number
  lastFailure?: Failure
  todos: string[]
  passed: Set<string>
  refused: Map<string, string>
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
    // `/usr/bin/npm`, `C:\tools\bun.exe` and `npm.cmd` are the runner too.
    const first = (words[0] ?? "").replace(/^.*[\\/]/, "").replace(/\.(cmd|exe|bat)$/i, "")
    if (/^python3?$/.test(first)) return words.some((w) => PYTHON_CHECKS.has(w))
    return RUNNERS.has(first)
  })
}

// Pipes, lists, redirects and substitutions: the exit code or the effect may not be the check's.
const COMPOUND = /[|;&<>`\n]|\$\(/

/** The normalized command when `e` is a plain check that passed in the foreground, in the session directory. */
function cleanPass(e: ToolAfterEvent, directory: string): string | undefined {
  if (e.tool !== "shell" || e.status !== "completed" || e.result.metadata?.exit !== 0) return undefined
  const i = (e.input ?? {}) as { command?: unknown; workdir?: unknown; background?: unknown }
  if (typeof i.command !== "string" || i.background === true || COMPOUND.test(i.command) || !runsCheck(i.command)) return undefined
  if (i.workdir !== undefined && (typeof i.workdir !== "string" || resolve(directory, i.workdir) !== resolve(directory))) return undefined
  return normalizeCheck(i.command)
}

const readOrNull = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null)

function toRelative(directory: string, path: string): string {
  return toPosix(relative(directory, isAbsolute(path) ? path : resolve(directory, path)))
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
      t = { changed: new Set(), changeSeq: 0, todos: [], passed: new Set(), refused: new Map(), testBaselines: new Map() }
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
      for (const path of targets(e.tool, e.input, directory)) {
        t.changed.add(path)
        t.refused.delete(path)
      }
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
    // Fail closed: anything that may change files (a shell command, a subagent, a failed call) drops earlier passes.
    // Only a check that is itself the latest such action can stand in for the gate's own run.
    if (LOOKUPS.has(e.tool) || e.tool === "todowrite") return
    t.passed.clear()
    const pass = cleanPass(e, directory)
    if (pass) {
      t.passed.add(pass)
      // A check that passes now outdates an earlier failing one (a wrong runner, say). The gate runs the project's checks itself.
      if (t.lastFailure?.tool === "shell") t.lastFailure = undefined
    }
  }

  /** A call another hook refused. opencode fires no after-hook for it, so the refusing hook reports it here. */
  refused(e: ToolBeforeEvent, message: string, directory: string): void {
    const t = this.turn(e.sessionID)
    for (const path of targets(e.tool, e.input, directory)) t.refused.set(path, message.slice(-SUMMARY_CHARS))
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
    const fresh = files.map(toPosix).filter((f) => !t.changed.has(f))
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
      refusedEdits: [...t.refused].sort(([a], [b]) => a.localeCompare(b)).map(([path, message]) => ({ path, message })),
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
