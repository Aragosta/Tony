import { checksSection, FOOTER, HEADER } from "./text.ts"

export interface CheckRun {
  command: string
  ok: boolean
  output: string
  /** Timed out or could not run: neither a pass nor a failure. */
  skipped?: boolean
}

export type GateStatus = "verified" | "no-changes" | "no-checks" | "unresolved" | "needs-user"

export interface GateInput {
  /** Latest results this turn; empty when none ran. */
  checks: readonly CheckRun[]
  finalText: string
  changedFiles: number
  rounds: number
  seen: ReadonlySet<string>
  maxRounds: number
}

export type Decision =
  | { kind: "continue"; keys: string[]; message: string; description: string }
  | { kind: "stop"; status: GateStatus; pending: string[] }

// "Blocked: STATUS_URL is not set", also as "**Blocked:**" or "## Blocked:".
const BLOCKED = /^[\s*_#>]*blocked\s*[*_]*\s*:/i

/** The reply opens with `Blocked:`: the agent says it can't finish without something outside the code. */
export function reportsBlocked(finalText: string): boolean {
  return BLOCKED.test(finalText.trim())
}

/** One reason to send the agent back: a failing check. A `Blocked:` answer stops, since the failure is the blocker. */
export function decide(input: GateInput): Decision {
  if (reportsBlocked(input.finalText)) return { kind: "stop", status: "needs-user", pending: [] }
  const failed = input.checks.find((c) => !c.ok && !c.skipped)
  if (failed) {
    const key = `checks:${failed.command}:${failed.output}`
    if (input.rounds < input.maxRounds && !input.seen.has(key)) {
      return {
        kind: "continue",
        keys: [key],
        message: `${HEADER}\n\n${checksSection(failed.command, failed.output)}\n\n${FOOTER}`,
        description: "Tony: checks failing",
      }
    }
    return { kind: "stop", status: "unresolved", pending: [`checks:${failed.command}`] }
  }
  const ran = input.checks.filter((c) => !c.skipped)
  if (ran.length > 0 && ran.every((c) => c.ok)) return { kind: "stop", status: "verified", pending: [] }
  if (input.changedFiles === 0) return { kind: "stop", status: "no-changes", pending: [] }
  return { kind: "stop", status: "no-checks", pending: [] }
}
