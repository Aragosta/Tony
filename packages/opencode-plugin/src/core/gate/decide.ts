import { checksSection, FOOTER, HEADER, reviewMessage } from "./text.ts"

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
  /** `gate.review`: once per request, send finished work back to be checked against the request. */
  review?: boolean
  /** The user's request, quoted in the review. */
  request?: string
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

export const REVIEW_KEY = "review"

/**
 * Sends the agent back for a failing check, and, with `review`, once to check finished work against the request.
 * A `Blocked:` answer stops, since the failure is the blocker.
 */
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
  if (input.review && input.changedFiles > 0 && !input.seen.has(REVIEW_KEY) && input.rounds < input.maxRounds) {
    return { kind: "continue", keys: [REVIEW_KEY], message: reviewMessage(input.request ?? ""), description: "Tony: review against the request" }
  }
  const ran = input.checks.filter((c) => !c.skipped)
  if (ran.length > 0 && ran.every((c) => c.ok)) return { kind: "stop", status: "verified", pending: [] }
  if (input.changedFiles === 0) return { kind: "stop", status: "no-changes", pending: [] }
  return { kind: "stop", status: "no-checks", pending: [] }
}
