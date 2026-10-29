import type { Host } from "../host.ts"
import type { LocalOptions, PromptOptions } from "../options.ts"
import { selectPrompt } from "./select.ts"

/** Replaces opencode's base prompt (system[0]) on primary requests; agents with their own prompt keep it. */
export async function registerPrompt(host: Host, opts: PromptOptions, local: LocalOptions): Promise<void> {
  if (!opts.enabled) return
  await host.onContext(async (e) => {
    const first = e.system[0]
    if (!first) return
    if (await host.agentHasCustomSystem(e.agent)) return
    e.system[0] = { ...first, text: selectPrompt(e.model, Object.keys(e.tools), local) }
  })
}
