import type { TurnEvidence } from "./evidence.ts"
import { ANNOUNCE_SECTION, checksSection, failureSection, FOOTER, HEADER, refusedSection, tamperSection, todosSection } from "./text.ts"

export interface CheckRun {
  command: string
  ok: boolean
  output: string
  /** Timed out or could not run: neither a pass nor a failure. */
  skipped?: boolean
  /** Not run: the agent itself ran it successfully after its last change. */
  reused?: boolean
}

export type GateStatus = "verified" | "no-changes" | "no-checks" | "unresolved" | "needs-user"

export interface GateInput {
  evidence: TurnEvidence
  /** Latest results this turn; empty when none ran. */
  checks: readonly CheckRun[]
  checksDetected: boolean
  finalText: string
  rounds: number
  seen: ReadonlySet<string>
  maxRounds: number
}

export type Decision =
  | { kind: "continue"; keys: string[]; message: string; description: string }
  | { kind: "stop"; status: GateStatus; pending: string[] }

interface Reason {
  key: string
  label: string
  section: string
}

// A next step names an action; "I'll wait for your feedback" or "I'll leave that to you" do not.
const ANNOUNCE =
  /^(?:(?:now|next|then),?\s+)?(?:let me|i'll|i will|i'm going to|i am going to)\s+(?:(?:now|next|also|then|quickly|go ahead and)\s+)*(?:run|check|add|fix|update|create|write|test|implement|look|verify|read|edit|change|remove|delete|refactor|install|build|try|search|inspect|investigate|open|make|apply|move|rename|start|continue|finish|do|commit|debug|review|clean)\b/i

/** The reply ends by announcing a next step ("Let me run the tests.") rather than reporting a result. */
export function announcesAction(finalText: string): boolean {
  const text = finalText.trim()
  if (text.endsWith(":")) return true
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0)
  const last = sentences.at(-1) ?? ""
  return ANNOUNCE.test(last)
}

function reasons(input: GateInput): Reason[] {
  const { evidence } = input
  const out: Reason[] = []
  const failed = input.checks.find((c) => !c.ok && !c.skipped)
  if (failed) out.push({ key: `checks:${failed.command}`, label: "checks failing", section: checksSection(failed.command, failed.output) })
  if (evidence.lastFailure) {
    const f = evidence.lastFailure
    out.push({ key: `failure:${f.key}`, label: "last action failed", section: failureSection(f) })
  }
  if (evidence.refusedEdits.length > 0) {
    out.push({ key: `refused:${evidence.refusedEdits.map((r) => r.path).join("|")}`, label: "edits refused", section: refusedSection(evidence.refusedEdits) })
  }
  if (evidence.testTampering.length > 0) {
    out.push({ key: `tamper:${evidence.testTampering.join("|")}`, label: "tests changed", section: tamperSection(evidence.testTampering) })
  }
  if (evidence.openTodos.length > 0) {
    out.push({ key: `todos:${evidence.openTodos.join("|")}`, label: "open todos", section: todosSection(evidence.openTodos) })
  }
  if (announcesAction(input.finalText)) out.push({ key: "announce", label: "unfinished action", section: ANNOUNCE_SECTION })
  return out
}

export function decide(input: GateInput): Decision {
  const all = reasons(input)
  const fresh = all.filter((r) => !input.seen.has(r.key))
  if (fresh.length > 0 && input.rounds < input.maxRounds) {
    return {
      kind: "continue",
      keys: fresh.map((r) => r.key),
      message: `${HEADER}\n\n${fresh.map((r) => r.section).join("\n\n")}\n\n${FOOTER}`,
      description: `Tony: ${fresh.map((r) => r.label).join(", ")}`,
    }
  }
  if (all.length > 0) return { kind: "stop", status: "unresolved", pending: all.map((r) => r.key) }
  const ran = input.checks.filter((c) => !c.skipped)
  if (ran.length > 0 && ran.every((c) => c.ok)) return { kind: "stop", status: "verified", pending: [] }
  if (input.evidence.changedFiles.length === 0) return { kind: "stop", status: "no-changes", pending: [] }
  return { kind: "stop", status: "no-checks", pending: [] }
}
