import { createHash } from "node:crypto"
import type { Host } from "../host.ts"
import type { LoopGuardOptions } from "../options.ts"
import { LoopDetector } from "./detector.ts"
import { resultText } from "../tool-result.ts"
import { fingerprint } from "./fingerprint.ts"

export const RESULT_EXCERPT_CHARS = 1500

export function blockMessage(tool: string, count: number, lastResult: string | undefined): string {
  const excerpt =
    lastResult !== undefined && lastResult.length > RESULT_EXCERPT_CHARS
      ? lastResult.slice(0, RESULT_EXCERPT_CHARS) + "…[truncated]"
      : lastResult
  return `Blocked: you already called \`${tool}\` with identical input ${count - 1} times in a row and nothing changed in between. Its last result was:\n<previous_result>\n${excerpt ?? "(no result recorded)"}\n</previous_result>\nUse that result, or change approach: different input, a different tool, or answer with what you have.`
}

export function stopMessage(tool: string, count: number): string {
  return `Stopped: \`${tool}\` was called with identical input ${count} times in a row. Execution is paused so the user can steer.`
}

// Inputs can be whole files (write, patch); keep a short digest instead.
const keyOf = (tool: string, input: unknown) => createHash("sha1").update(fingerprint(tool, input)).digest("hex")

export async function registerLoopGuard(host: Host, opts: LoopGuardOptions): Promise<void> {
  if (!opts.enabled) return
  const detector = new LoopDetector(opts)
  // Only the latest result per session can be quoted: a block always follows a run of the same key.
  const lastResults = new Map<string, { key: string; text: string }>()
  const exempt = new Set(opts.exemptTools)
  const mutations = new Set(opts.mutationTools)

  await host.onToolBefore((e) => {
    if (exempt.has(e.tool)) return
    const key = keyOf(e.tool, e.input)
    const verdict = detector.record(e.sessionID, key)
    if (verdict.kind === "block") {
      const last = lastResults.get(e.sessionID)
      throw new Error(blockMessage(e.tool, verdict.count, last?.key === key ? last.text : undefined))
    }
    if (verdict.kind === "stop") {
      detector.reset(e.sessionID)
      // Pause the top-level session: interrupting only a subagent just hands "cancelled" back to its parent.
      // Never awaited inside the hook: the run is waiting on this hook.
      setTimeout(() => {
        host
          .rootSession(e.sessionID)
          .then((root) => host.interrupt(root))
          .catch(() => {})
      }, 0)
      throw new Error(stopMessage(e.tool, verdict.count))
    }
  })

  await host.onToolAfter((e) => {
    if (e.status === "completed" && mutations.has(e.tool)) detector.markMutation(e.sessionID)
    const text = resultText(e)
    // Keep only what blockMessage can show, so large outputs are not held in memory.
    if (text !== undefined) {
      lastResults.set(e.sessionID, { key: keyOf(e.tool, e.input), text: text.slice(0, RESULT_EXCERPT_CHARS + 1) })
    }
  })

  // A new prompt means the user (or the world) may have changed things; repeating a check is legitimate again.
  await host.onPrompt((e) => {
    detector.reset(e.sessionID)
    lastResults.delete(e.sessionID)
  })
}
