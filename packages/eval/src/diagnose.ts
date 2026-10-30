// Turns a run's timeline into a diagnosis: what the model did from prompt to answer, where it went wrong, and a list of
// findings with a fixed vocabulary (`kind`), so failure modes can be counted across runs.
import type { Step, Timeline, ToolCall } from "./timeline.ts"
import { finalText } from "./timeline.ts"

/** Per-task hints from `task.json` `diag`, so findings can name what matters for this task. */
export interface DiagHints {
  /** The ability the task tests, one line. */
  skill?: string
  /** What makes it hard: the trap a weak run falls into. */
  trap?: string
  /** Files the real fix lives in. A run that never reads them fixed a symptom, or guessed. */
  keyFiles?: string[]
  /** Path prefixes the agent must not change (tests, fixtures). */
  protect?: string[]
}

export interface DiagContext {
  passed: boolean
  timedOut: boolean
  failedCheck?: string
  checkOutput: string
  /** Files that differ from the starting commit at the end of the run, including new ones. */
  changedFiles: string[]
  /** Files in the starting repo, relative. */
  repoFiles: string[]
  hints: DiagHints
  /** Rounds Tony's gate sent the agent back, when the variant has the gate. */
  gateRounds?: number
}

export type Severity = "bad" | "warn" | "info"

export interface Finding {
  kind: string
  severity: Severity
  /** The step it happened at, when it is tied to one. */
  step?: number
  detail: string
}

export type Activity = "explore" | "edit" | "verify" | "run" | "answer" | "other"

export interface Phase {
  activity: Activity
  from: number
  to: number
  summary: string
}

export interface Stats {
  steps: number
  calls: number
  failedCalls: number
  /** Steps that made more than one call. */
  parallelSteps: number
  reasoningChars: number
  stepsWithReasoning: number
  tokens: { input: number; output: number; reasoning: number; cacheRead: number }
  seconds: number
  /** Seconds spent inside tool calls; the rest is the model (and opencode). */
  toolSeconds: number
  filesRead: number
  filesEdited: number
  checkRuns: number
}

export interface Diagnosis {
  outcome: "pass" | "fail" | "timeout" | "error"
  /** One line per phase, prompt to answer. */
  path: string
  /** For failed runs: the first finding that marks a wrong turn. */
  wrongTurn?: Finding
  phases: Phase[]
  findings: Finding[]
  stats: Stats
  finalText: string
}

// ---- classifying calls ----

const SEARCH = new Set(["grep", "glob", "list", "codesearch"])
const MUTATE = new Set(["edit", "write", "patch"])
const INSPECT = new Set(["cat", "head", "tail", "sed", "ls", "find", "grep", "rg", "wc", "tree", "nl", "awk", "less", "file", "stat", "pwd", "echo"])
const READERS = new Set(["cat", "head", "tail", "sed", "nl", "less", "awk"])
const CHECK =
  /\b(?:(?:bun|npm|pnpm|yarn|npx|bunx|deno)\s+(?:run\s+)?(?:test|typecheck|lint|check|build)\b|tsc\b|pytest\b|vitest\b|jest\b|mocha\b|cargo\s+(?:test|check|build|clippy)\b|go\s+(?:test|vet|build)\b|make\s+(?:test|check)\b|ruff\b|mypy\b|eslint\b)/

export const command = (c: ToolCall) => (typeof c.input.command === "string" ? c.input.command : "")
const firstWord = (cmd: string) => (cmd.trim().split(/\s+/)[0] ?? "").replace(/^.*\//, "")

export function isCheck(c: ToolCall): boolean {
  return c.tool === "shell" && CHECK.test(command(c))
}

/** A check run failed: a non-zero exit, or an error. */
const failedRun = (c: ToolCall) => c.status === "error" || (c.exit !== undefined && c.exit !== 0)

export function activityOf(c: ToolCall): Activity {
  if (MUTATE.has(c.tool)) return "edit"
  if (c.tool === "read" || SEARCH.has(c.tool)) return "explore"
  if (c.tool === "shell") {
    if (isCheck(c)) return "verify"
    const cmd = command(c)
    const words = cmd.split(/&&|\|\||[;|]/).map((s) => firstWord(s))
    if (words.every((w) => INSPECT.has(w) || w === "git" || w === "cd" || w === "")) return "explore"
    return "run"
  }
  return "other"
}

function normalize(path: string, repoFiles: readonly string[]): string {
  let p = path.replace(/\\/g, "/").replace(/^\.\//, "")
  if (p.startsWith("/")) {
    const hit = repoFiles.find((f) => p.endsWith("/" + f))
    if (hit) p = hit
  }
  return p
}

/** Files a call reads (read tool, or cat/head/sed of repo files). */
function readsOf(c: ToolCall, repoFiles: readonly string[]): string[] {
  if (c.tool === "read") return typeof c.input.path === "string" ? [normalize(c.input.path, repoFiles)] : typeof c.input.filePath === "string" ? [normalize(c.input.filePath, repoFiles)] : []
  if (c.tool !== "shell" || c.status !== "completed") return []
  const out: string[] = []
  for (const segment of command(c).split(/&&|\|\||[;|]/)) {
    if (!READERS.has(firstWord(segment))) continue
    for (const token of segment.trim().split(/\s+/).slice(1)) {
      const f = normalize(token.replace(/^['"]|['"]$/g, ""), repoFiles)
      if (repoFiles.includes(f)) out.push(f)
    }
  }
  return out
}

/** Files a mutation call targets. */
function editsOf(c: ToolCall, repoFiles: readonly string[]): string[] {
  if (c.tool === "patch") {
    const text = typeof c.input.patchText === "string" ? c.input.patchText : ""
    return [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => normalize(m[1]!.trim(), repoFiles))
  }
  if (!MUTATE.has(c.tool)) return []
  const p = c.input.path ?? c.input.filePath
  return typeof p === "string" ? [normalize(p, repoFiles)] : []
}

const key = (c: ToolCall) => `${c.tool}:${JSON.stringify(c.input)}`
const firstLine = (s: string, max = 160) => {
  const l = s.trim().split("\n").find((x) => x.trim()) ?? ""
  return l.length > max ? l.slice(0, max - 1) + "…" : l
}
export const describeCall = (c: ToolCall) => {
  const detail = command(c) || [c.input.path, c.input.filePath, c.input.pattern, c.input.url].find((v) => typeof v === "string") || ""
  const d = String(detail).replace(/\s+/g, " ").trim()
  return `${c.tool} ${d.length > 90 ? d.slice(0, 89) + "…" : d}`.trim()
}

// ---- the answer ----

const BLOCKED = /^[\s*_#>]*blocked\s*[*_]*\s*:/i
const CLAIM = /\b(fixed|done|complete[d]?|implemented|works|working|pass(?:es|ed|ing)?|all (?:tests|checks)|resolved|green|succeed(?:s|ed)?)\b/i
const ADMIT = /\b(could ?n[o']t|cannot|can't|unable|still fail|not (?:yet )?(?:fixed|working|pass)|fail(?:s|ing|ed)?\b(?! *(?:->|→) *pass)|blocked|didn't|did not|incomplete|partially)\b/i
const ANNOUNCE = /(?:^|\n|\. )\s*(?:now |next,? |then )?(?:let me|i'll|i will|i'm going to|next i(?:'ll| will))\s+\w+[^.]*[.:]?\s*$/i
/** Tool calls the model wrote as text: the chat template or the server did not parse them. */
const TOOLCALL_TEXT = /<tool_call>|<function=|<\|tool_call|"(?:name|tool)"\s*:\s*"\w+"\s*,\s*"(?:arguments|parameters|args)"\s*:/

// ---- diagnose ----

export function diagnose(t: Timeline, ctx: DiagContext): Diagnosis {
  const findings: Finding[] = []
  const add = (kind: string, severity: Severity, detail: string, step?: number) => findings.push({ kind, severity, detail, ...(step ? { step } : {}) })
  const repo = ctx.repoFiles
  const steps = t.steps
  const answer = finalText(t)

  // Walk every call in order, tracking what was read, edited and checked.
  const readAt = new Map<string, number>()
  const editedAt = new Map<string, number>()
  const seen = new Map<string, number>()
  let lastEditStep = 0
  let lastCheck: { step: number; call: ToolCall } | undefined
  let checkRuns = 0
  let failingChecksInRow = 0
  let flailingReported = false
  let prevFailed: string | undefined
  const edits: { step: number; path: string; oldString?: string; newString?: string }[] = []

  for (const s of steps) {
    if (TOOLCALL_TEXT.test(s.text) || TOOLCALL_TEXT.test(s.reasoning)) {
      add("toolcall-as-text", "bad", "a tool call was written as text instead of called; check llama-server --jinja and the chat template", s.index)
    }
    if (s.reasoning.length > 8000) add("long-thinking", "warn", `${s.reasoning.length} characters of thinking in one step`, s.index)
    for (const c of s.calls) {
      const k = key(c)
      // Repeats: the same call while nothing was edited since.
      const before = seen.get(k)
      if (before !== undefined && before >= lastEditStep && c.tool !== "shell" && activityOf(c) === "explore") {
        add("repeat-call", "warn", `${describeCall(c)} again (first at step ${before}), with no edit in between`, s.index)
      }
      seen.set(k, s.index)

      if (c.status === "error") {
        const msg = firstLine(c.output)
        if (/^Blocked:|^Stopped:/.test(c.output)) add("loop-guard", "warn", `Tony's loop guard: ${msg}`, s.index)
        else if (prevFailed === k) add("retry-unchanged", "warn", `retried a failed call without changing it: ${describeCall(c)}`, s.index)
        else if (/oldString|not found in|no match|could not find/i.test(c.output) && c.tool === "edit") add("edit-no-match", "warn", `edit did not apply: ${msg}`, s.index)
        else if (/ENOENT|no such file|not found|does not exist/i.test(c.output)) add("file-not-found", "warn", `${describeCall(c)}: ${msg}`, s.index)
        else if (/invalid|schema|expected|required|parse/i.test(c.output)) add("bad-arguments", "warn", `${describeCall(c)}: ${msg}`, s.index)
        else add("tool-error", "warn", `${describeCall(c)}: ${msg}`, s.index)
        prevFailed = k
      } else prevFailed = undefined

      for (const f of readsOf(c, repo)) if (!readAt.has(f)) readAt.set(f, s.index)
      if (c.status === "completed") {
        for (const f of editsOf(c, repo)) {
          const existing = repo.includes(f)
          if (existing && !readAt.has(f)) add("blind-edit", "warn", `changed ${f} without reading it first`, s.index)
          if (c.tool === "write" && existing) add("whole-file-write", "info", `rewrote all of ${f} with write instead of editing it`, s.index)
          if (!editedAt.has(f)) editedAt.set(f, s.index)
          const e = { step: s.index, path: f, oldString: c.input.oldString as string | undefined, newString: c.input.newString as string | undefined }
          const undo = edits.find((x) => x.path === f && x.oldString !== undefined && x.oldString === e.newString && x.newString === e.oldString)
          if (undo) add("oscillation", "warn", `undid its own edit to ${f} from step ${undo.step}`, s.index)
          edits.push(e)
          // A write counts as reading the file from then on.
          readAt.set(f, readAt.get(f) ?? s.index)
        }
        if (MUTATE.has(c.tool)) lastEditStep = s.index
      }
      if (isCheck(c)) {
        checkRuns++
        lastCheck = { step: s.index, call: c }
        if (failedRun(c)) {
          failingChecksInRow++
          if (failingChecksInRow >= 3 && !flailingReported) {
            flailingReported = true
            add("check-flailing", "warn", `3 failing check runs in a row (trial and error): \`${command(c)}\``, s.index)
          }
        } else failingChecksInRow = 0
      }
    }
  }

  // Verification.
  if (editedAt.size > 0 && checkRuns === 0) add("no-verify", "bad", "changed files but never ran a test, typecheck or build command", lastEditStep)
  else if (lastCheck && lastEditStep > lastCheck.step) add("unverified-final-edit", "warn", `edited at step ${lastEditStep}, after the last check at step ${lastCheck.step}`, lastEditStep)
  if (lastCheck && failedRun(lastCheck.call) && lastEditStep <= lastCheck.step && !BLOCKED.test(answer.trim())) {
    add("ended-on-failing-check", "bad", `the last check \`${command(lastCheck.call)}\` failed (exit ${lastCheck.call.exit ?? "error"}) and the agent stopped`, lastCheck.step)
  }

  // Exploration: did it find where the real fix lives?
  for (const f of ctx.hints.keyFiles ?? []) {
    if (!readAt.has(f) && !editedAt.has(f)) add("key-file-missed", ctx.passed ? "warn" : "bad", `never opened ${f}, where the fix belongs`)
    else if (!editedAt.has(f) && !ctx.passed) add("key-file-not-changed", "bad", `read ${f} at step ${readAt.get(f)} but did not change it`, readAt.get(f))
  }
  // Only files that were there at the start: adding a new test is allowed (and what the review asks for).
  const protectedHits = ctx.changedFiles.filter(
    (f) => repo.includes(f) && (ctx.hints.protect ?? []).some((p) => f === p || f.startsWith(p.endsWith("/") ? p : p + "/")),
  )
  if (protectedHits.length > 0) add("protected-changed", "bad", `changed protected files: ${protectedHits.join(", ")}`)

  // Serial reads that could have been one parallel turn.
  let run = 0
  for (const s of steps) {
    const solo = s.calls.length === 1 && activityOf(s.calls[0]!) === "explore"
    run = solo ? run + 1 : 0
    if (run === 3) add("serial-reads", "info", "3+ steps in a row with one read or search each; these could be one turn", s.index)
  }

  // The answer.
  const last = steps.at(-1)
  if (!answer.trim()) add("no-answer", "bad", "ended without a final message", last?.index)
  else if (BLOCKED.test(answer.trim())) add("blocked", "info", `answered Blocked: ${firstLine(answer.trim().replace(BLOCKED, ""))}`, last?.index)
  else if (ANNOUNCE.test(answer.trim())) add("ended-announcing", "bad", `ended by announcing a step it did not take: "${firstLine(answer.trim().split("\n").at(-1) ?? "")}"`, last?.index)
  // "12 pass, 0 fail" reports a pass, not a failure.
  const admits = ADMIT.test(answer.replace(/\b0 (?:fail(?:ed|ures?)?|errors?)\b/gi, ""))
  if (answer.trim() && !ctx.passed && !ctx.timedOut && !BLOCKED.test(answer.trim())) {
    if (CLAIM.test(answer) && !admits) add("false-claim", "bad", `claimed success but the run failed: "${firstLine(answer)}"`, last?.index)
    else if (admits) add("honest-failure", "info", "said the work is not done", last?.index)
  }
  if (ctx.timedOut) add("timeout", "bad", "ran out of time")
  for (const e of t.errors) add("infra-error", "bad", `opencode error: ${firstLine(e)}`)
  if (!ctx.passed && ctx.failedCheck) {
    const failing = ctx.checkOutput.split("\n").filter((l) => /^\s*\(fail\)/.test(l)).map((l) => l.trim().replace(/^\(fail\)\s*/, "").replace(/\s*\[[\d.]+ms\]$/, ""))
    const why = failing.length ? `${failing.length} failing: ${failing.slice(0, 3).join("; ")}${failing.length > 3 ? "; …" : ""}` : firstLine(ctx.checkOutput.split("\n").filter((l) => /fail|error|expect|✗/i.test(l)).join("\n") || ctx.checkOutput)
    add("check-failed", "bad", `grader check "${ctx.failedCheck}" failed: ${why}`)
    // Its own checks passed; the grader's did not: the fix covers what the visible tests show, not the whole request.
    if (lastCheck && !failedRun(lastCheck.call) && ctx.failedCheck !== "tests unchanged") {
      add("incomplete-fix", "bad", `its own \`${command(lastCheck.call)}\` passed at step ${lastCheck.step}, but the grader's "${ctx.failedCheck}" failed: fixed what the visible tests show, not all of the request`)
    }
  }
  if (ctx.gateRounds) add("gate-nudge", "info", `Tony's gate sent the agent back ${ctx.gateRounds} time(s)`)
  const reasoningChars = steps.reduce((a, s) => a + s.reasoning.length, 0)
  if (steps.length > 0 && reasoningChars === 0) add("no-thinking", "info", "no thinking in the stream (model without reasoning, or the server drops reasoning_content)")

  const phases = phasesOf(steps, repo)
  const outcome = ctx.timedOut ? "timeout" : t.errors.length > 0 && !ctx.passed ? "error" : ctx.passed ? "pass" : "fail"
  const wrongTurn = outcome === "pass" ? undefined : pickWrongTurn(findings)
  const totals = steps.reduce(
    (a, s) => ({ input: a.input + s.tokens.input, output: a.output + s.tokens.output, reasoning: a.reasoning + s.tokens.reasoning, cacheRead: a.cacheRead + s.tokens.cacheRead }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0 },
  )
  const calls = steps.flatMap((s) => s.calls)
  return {
    outcome,
    path: phases.map((p) => `${p.activity} (${p.from === p.to ? p.from : `${p.from}–${p.to}`}: ${p.summary})`).join(" → "),
    ...(wrongTurn ? { wrongTurn } : {}),
    phases,
    findings,
    stats: {
      steps: steps.length,
      calls: calls.length,
      failedCalls: calls.filter((c) => c.status === "error").length,
      parallelSteps: steps.filter((s) => s.calls.length > 1).length,
      reasoningChars,
      stepsWithReasoning: steps.filter((s) => s.reasoning.trim()).length,
      tokens: totals,
      seconds: t.startedAt && t.endedAt ? (t.endedAt - t.startedAt) / 1000 : 0,
      toolSeconds: calls.reduce((a, c) => a + Math.max(0, c.ms), 0) / 1000,
      filesRead: readAt.size,
      filesEdited: editedAt.size,
      checkRuns,
    },
    finalText: answer,
  }
}

// Findings that explain a failure, most basic first: a broken setup, then not finding or not changing the right code,
// then not checking the work. Anything else falls back to the earliest bad finding by step.
const CAUSES = [
  "toolcall-as-text",
  "infra-error",
  "timeout",
  "key-file-missed",
  "key-file-not-changed",
  "protected-changed",
  "no-verify",
  "ended-on-failing-check",
  "ended-announcing",
  "no-answer",
  "incomplete-fix",
]

function pickWrongTurn(findings: readonly Finding[]): Finding | undefined {
  for (const kind of CAUSES) {
    const f = findings.find((x) => x.kind === kind)
    if (f) return f
  }
  const bad = findings.filter((f) => f.severity === "bad")
  return bad.filter((f) => f.step !== undefined).sort((a, b) => a.step! - b.step!)[0] ?? bad[0]
}

function stepActivity(s: Step): Activity {
  const kinds = new Set(s.calls.map(activityOf))
  for (const a of ["edit", "verify", "run", "explore", "other"] as const) if (kinds.has(a)) return a
  return "answer"
}

function phasesOf(steps: readonly Step[], repo: readonly string[]): Phase[] {
  const phases: { activity: Activity; steps: Step[] }[] = []
  for (const s of steps) {
    const a = stepActivity(s)
    const last = phases.at(-1)
    if (last && last.activity === a) last.steps.push(s)
    else phases.push({ activity: a, steps: [s] })
  }
  return phases.map(({ activity, steps: ss }) => {
    const calls = ss.flatMap((s) => s.calls)
    let summary: string
    switch (activity) {
      case "explore": {
        const files = new Set(calls.flatMap((c) => readsOf(c, repo)))
        const searches = calls.filter((c) => SEARCH.has(c.tool) || (c.tool === "shell" && readsOf(c, repo).length === 0)).length
        summary = [files.size ? `read ${[...files].slice(0, 4).join(", ")}${files.size > 4 ? ` +${files.size - 4}` : ""}` : "", searches ? `${searches} search(es)` : ""].filter(Boolean).join(", ") || `${calls.length} call(s)`
        break
      }
      case "edit": {
        const files = new Set(calls.flatMap((c) => (c.status === "completed" ? editsOf(c, repo) : [])))
        const failed = calls.filter((c) => MUTATE.has(c.tool) && c.status === "error").length
        summary = `${[...files].join(", ") || "no file changed"}${failed ? `, ${failed} failed edit(s)` : ""}`
        break
      }
      case "verify":
        summary = calls
          .filter(isCheck)
          .map((c) => `\`${command(c).slice(0, 40)}\` ${failedRun(c) ? "✗" : "✓"}`)
          .join(", ")
        break
      case "run":
        summary = calls
          .filter((c) => activityOf(c) === "run")
          .map((c) => `\`${command(c).slice(0, 40)}\`${failedRun(c) ? " ✗" : ""}`)
          .join(", ")
        break
      case "answer": {
        const text = ss.at(-1)?.text ?? ""
        summary = text.trim() ? `"${firstLine(text, 70)}"` : "no text"
        break
      }
      default:
        summary = [...new Set(calls.map((c) => c.tool))].join(", ")
    }
    return { activity, from: ss[0]!.index, to: ss.at(-1)!.index, summary }
  })
}
