import type { Host, IdleEvent } from "../../host.ts"
import type { GateOptions } from "../../options.ts"
import type { Exec } from "../verify/exec.ts"
import { ChangeTracker } from "./changes.ts"
import { decide, REVIEW_KEY, type CheckRun } from "./decide.ts"
import { writeStatus } from "./status.ts"

export interface GateDeps {
  exec: Exec
  detect: (dir: string) => string[]
}

interface GateState {
  rounds: number
  seen: Set<string>
  checks: CheckRun[]
  checkedSeq: number
}

/** Runs the checks in order within one time budget; stops at the first failure or timeout. */
async function runChecks(exec: Exec, commands: readonly string[], dir: string, budgetMs: number): Promise<CheckRun[]> {
  const deadline = Date.now() + budgetMs
  const runs: CheckRun[] = []
  for (const command of commands) {
    const left = deadline - Date.now()
    if (left <= 0) {
      runs.push({ command, ok: false, output: "", skipped: true })
      break
    }
    const r = await exec(command, dir, left)
    if (r.timedOut || r.code === null) {
      runs.push({ command, ok: false, output: r.output, skipped: true })
      break
    }
    runs.push({ command, ok: r.code === 0, output: r.output })
    if (r.code !== 0) break
  }
  return runs
}

/**
 * Completion gate: when a root session would go idle after changing files, run the project's checks and send the
 * agent back with the output if they fail; with `review`, also once to check the finished work against the request.
 * Bounded per user prompt; a failure inside the gate lets the agent stop.
 */
export async function registerGate(host: Host, opts: GateOptions, deps: GateDeps): Promise<void> {
  if (!opts.enabled) return
  const tracker = new ChangeTracker()
  const states = new Map<string, GateState>()
  const state = (sessionID: string) => {
    let s = states.get(sessionID)
    if (!s) states.set(sessionID, (s = { rounds: 0, seen: new Set(), checks: [], checkedSeq: 0 }))
    return s
  }
  // A session's directory doesn't change; look it up once, not on every tool call.
  const directories = new Map<string, string>()
  const directory = async (sessionID: string) => {
    let d = directories.get(sessionID)
    if (!d) directories.set(sessionID, (d = (await host.sessionInfo(sessionID)).directory))
    return d
  }

  await host.onPrompt((e) => {
    tracker.beginTurn(e.sessionID)
    states.delete(e.sessionID)
  })
  // Tracking must never reject a tool call.
  await host.onToolAfter(async (e) => {
    try {
      tracker.after(e, await directory(e.sessionID))
    } catch {}
  })

  const idle = async (e: IdleEvent) => {
    const info = await host.sessionInfo(e.sessionID)
    if (info.parentID) return
    // That work wakes the session again when it finishes; check then.
    if (e.background.some((b) => b.sessionID === e.sessionID && (b.kind === "shell" || b.kind === "subagent"))) return
    const st = state(e.sessionID)

    const messages = await host.transcript(e.sessionID)
    let start = 0
    let request = ""
    messages.forEach((m, i) => {
      if (m.type === "user") {
        start = i + 1
        request = m.text
      }
    })
    let finalText = ""
    for (const m of messages.slice(start)) {
      if (m.type !== "assistant") continue
      tracker.addSnapshotFiles(e.sessionID, m.files)
      finalText = m.text
    }

    const changes = tracker.changes(e.sessionID)
    const commands = opts.checks.length > 0 ? opts.checks : deps.detect(info.directory)
    if (commands.length > 0 && changes.seq > st.checkedSeq) {
      st.checks = await runChecks(deps.exec, commands, info.directory, opts.checkTimeoutMs)
      st.checkedSeq = changes.seq
    }

    const decision = decide({
      checks: st.checks,
      finalText,
      changedFiles: changes.files.length,
      rounds: st.rounds,
      seen: st.seen,
      maxRounds: opts.maxRounds,
      review: opts.review,
      request,
    })
    if (decision.kind === "continue") {
      st.rounds++
      for (const k of decision.keys) st.seen.add(k)
      await host.continueWith(e.sessionID, decision.message, decision.description)
      return
    }
    writeStatus({
      sessionID: e.sessionID,
      status: decision.status,
      rounds: st.rounds,
      checks: st.checks.map((c) => ({ command: c.command, ok: c.ok, ...(c.skipped ? { skipped: true } : {}) })),
      pending: decision.pending,
      ...(st.seen.has(REVIEW_KEY) ? { reviewed: true } : {}),
    })
  }

  await host.onIdle(async (e) => {
    try {
      await idle(e)
    } catch {
      // Never keep the user waiting on a gate bug: let the agent stop.
    }
  })
}
