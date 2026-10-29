import type { Host, IdleEvent } from "../host.ts"
import type { GateOptions } from "../options.ts"
import type { Exec } from "../verify/exec.ts"
import { decide, type CheckRun, type GateStatus } from "./decide.ts"
import { checkAliases } from "../verify/detect.ts"
import type { EvidenceTracker } from "./evidence.ts"
import { judgeMessage, judgePrompt, parseVerdict } from "./judge.ts"
import { writeStatus, type StatusRecord } from "./status.ts"

export interface GateDeps {
  exec: Exec
  detect: (dir: string) => string[]
  tracker: EvidenceTracker
}

interface GateState {
  rounds: number
  seen: Set<string>
  checks: CheckRun[]
  checkedSeq: number
}

/**
 * Runs the checks in order within one time budget; stops at the first failure or timeout. A check the agent already
 * passed after its last change (`passed`, normalized) is not run again.
 */
async function runChecks(exec: Exec, commands: readonly string[], dir: string, budgetMs: number, passed: readonly string[]): Promise<CheckRun[]> {
  const deadline = Date.now() + budgetMs
  const runs: CheckRun[] = []
  for (const command of commands) {
    if (checkAliases(command, dir).some((a) => passed.includes(a))) {
      runs.push({ command, ok: true, output: "", reused: true })
      continue
    }
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
 * Completion gate: when a root session would go idle, check the evidence (project checks after the last change,
 * the last failed action, changed tests, open todos, an announced next step) and send the agent back with what is
 * wrong. Bounded per user prompt; a failure inside the gate lets the agent stop.
 */
export async function registerGate(host: Host, opts: GateOptions, deps: GateDeps): Promise<void> {
  if (!opts.enabled) return
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
    deps.tracker.beginTurn(e.sessionID)
    states.delete(e.sessionID)
  })
  // Evidence hooks must never reject a tool call.
  await host.onToolBefore(async (e) => {
    try {
      await deps.tracker.before(e, await directory(e.sessionID))
    } catch {}
  })
  await host.onToolAfter(async (e) => {
    try {
      deps.tracker.after(e, await directory(e.sessionID))
    } catch {}
  })

  const idle = async (e: IdleEvent) => {
    const info = await host.sessionInfo(e.sessionID)
    if (info.parentID) return
    // That work wakes the session again when it finishes; judge then.
    if (e.background.some((b) => b.sessionID === e.sessionID && (b.kind === "shell" || b.kind === "subagent"))) return
    const st = state(e.sessionID)

    const messages = await host.transcript(e.sessionID)
    let start = 0
    messages.forEach((m, i) => {
      if (m.type === "user") start = i + 1
    })
    const turn = messages.slice(start)
    let finalText = ""
    for (const m of turn) {
      if (m.type !== "assistant") continue
      deps.tracker.addSnapshotFiles(e.sessionID, m.files)
      finalText = m.text
    }

    const evidence = await deps.tracker.evidence(e.sessionID, info.directory)
    const commands = opts.checks.length > 0 ? opts.checks : deps.detect(info.directory)
    if (commands.length > 0 && evidence.changeSeq > st.checkedSeq) {
      st.checks = await runChecks(deps.exec, commands, info.directory, opts.checkTimeoutMs, evidence.passedChecks)
      st.checkedSeq = evidence.changeSeq
    }

    const decision = decide({
      evidence,
      checks: st.checks,
      checksDetected: commands.length > 0,
      finalText,
      rounds: st.rounds,
      seen: st.seen,
      maxRounds: opts.maxRounds,
    })
    if (decision.kind === "continue") {
      st.rounds++
      for (const k of decision.keys) st.seen.add(k)
      await host.continueWith(e.sessionID, decision.message, decision.description)
      return
    }

    let status: GateStatus = decision.status
    let pending = decision.pending
    let judge: StatusRecord["judge"]
    if (opts.judge && pending.length === 0 && evidence.changedFiles.length > 0) {
      const verdict = parseVerdict(await host.judge(e.sessionID, judgePrompt(st.checks)))
      judge = verdict?.verdict ?? "invalid"
      if (verdict?.verdict === "continue") {
        const key = `judge:${verdict.reason}`
        if (st.rounds < opts.maxRounds && !st.seen.has(key)) {
          st.rounds++
          st.seen.add(key)
          await host.continueWith(e.sessionID, judgeMessage(verdict), "Tony: reviewer found gaps")
          return
        }
        status = "unresolved"
        pending = [key]
      }
      if (verdict?.verdict === "blocked") status = "needs-user"
    }

    writeStatus({
      sessionID: e.sessionID,
      status,
      rounds: st.rounds,
      checks: st.checks.map((c) => ({ command: c.command, ok: c.ok, ...(c.skipped ? { skipped: true } : {}), ...(c.reused ? { reused: true } : {}) })),
      pending,
      testsChanged: evidence.testTampering,
      ...(judge ? { judge } : {}),
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
