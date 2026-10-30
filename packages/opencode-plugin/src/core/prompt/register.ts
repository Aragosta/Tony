import type { Host } from "../../host.ts"
import type { TonyOptions } from "../../options.ts"
import { selectTier, type TierId } from "../../tiers/index.ts"
import { assemblePrompt } from "./select.ts"

/**
 * Replaces opencode's base prompt (system[0]) on primary requests with the core prompt plus the model's tier text;
 * agents with their own prompt keep it. Records each session's tier in `tiers`.
 */
export async function registerPrompt(host: Host, o: TonyOptions, tiers: Map<string, TierId>): Promise<void> {
  if (!o.prompt.enabled) return
  await host.onContext(async (e) => {
    const first = e.system[0]
    if (!first) return
    if (await host.agentHasCustomSystem(e.agent)) return
    const tier = selectTier(e.model, o)
    tiers.set(e.sessionID, tier.id)
    e.system[0] = { ...first, text: assemblePrompt(Object.keys(e.tools), tier) }
  })
}
