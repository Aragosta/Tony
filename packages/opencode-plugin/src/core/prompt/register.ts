import type { Host } from "../../host.ts"
import type { TonyOptions } from "../../options.ts"
import { selectTier, type TierId } from "../../tiers/index.ts"
import { detectChecks } from "../verify/detect.ts"
import { assemblePrompt } from "./select.ts"

/**
 * Replaces opencode's base prompt (system[0]) on primary requests with the core prompt plus the model's tier text;
 * agents with their own prompt keep it. Records each session's tier in `tiers`.
 */
export async function registerPrompt(
  host: Host,
  o: TonyOptions,
  tiers: Map<string, TierId>,
  detect: (dir: string) => string[] = detectChecks,
): Promise<void> {
  if (!o.prompt.enabled) return
  // Detected once per session: the prompt must not change between requests, or the prompt cache misses.
  const checks = new Map<string, string[]>()
  const checksFor = async (sessionID: string) => {
    let c = checks.get(sessionID)
    if (!c) {
      try {
        c = o.gate.checks.length > 0 ? o.gate.checks : detect((await host.sessionInfo(sessionID)).directory)
      } catch {
        c = []
      }
      checks.set(sessionID, c)
    }
    return c
  }
  await host.onContext(async (e) => {
    const first = e.system[0]
    if (!first) return
    if (await host.agentHasCustomSystem(e.agent)) return
    const tier = selectTier(e.model, o)
    tiers.set(e.sessionID, tier.id)
    e.system[0] = { ...first, text: assemblePrompt(Object.keys(e.tools), tier, await checksFor(e.sessionID)) }
  })
}
