import type { Host, ToolAfterEvent } from "../host.ts"
import type { LoopGuardOptions } from "../options.ts"
import { LoopDetector } from "./detector.ts"
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

function resultText(e: ToolAfterEvent): string | undefined {
  if (e.status !== "completed") return undefined
  const content = e.result.content
  if (content === undefined) return undefined
  if (typeof content === "string") return content
  return content
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
}

export async function registerLoopGuard(host: Host, opts: LoopGuardOptions): Promise<void> {
  if (!opts.enabled) return
  const detector = new LoopDetector(opts)
  const lastResults = new Map<string, string>()
  const exempt = new Set(opts.exemptTools)
  const mutations = new Set(opts.mutationTools)

  await host.onToolBefore((e) => {
    if (exempt.has(e.tool)) return
    const key = fingerprint(e.tool, e.input)
    const verdict = detector.record(e.sessionID, key)
    if (verdict.kind === "block") {
      throw new Error(blockMessage(e.tool, verdict.count, lastResults.get(`${e.sessionID}\u0000${key}`)))
    }
    if (verdict.kind === "stop") {
      detector.reset(e.sessionID)
      // Never await the interrupt inside the hook: the run is waiting on this hook.
      setTimeout(() => void host.interrupt(e.sessionID), 0)
      throw new Error(stopMessage(e.tool, verdict.count))
    }
  })

  await host.onToolAfter((e) => {
    if (e.status !== "completed") return
    if (mutations.has(e.tool)) detector.markMutation(e.sessionID)
    const text = resultText(e)
    // Keep only what blockMessage can show, so large outputs are not held in memory.
    if (text !== undefined) lastResults.set(`${e.sessionID}\u0000${fingerprint(e.tool, e.input)}`, text.slice(0, RESULT_EXCERPT_CHARS + 1))
  })
}
