import type { Host } from "../../host.ts"
import type { TonyOptions } from "../../options.ts"
import { detectChecks } from "../verify/detect.ts"
import { promptAddition } from "./text.ts"

/**
 * Appends Tony's short addition to opencode's base prompt (system[0]) on primary requests, keeping opencode's own
 * per-model prompt and tool guidance. Agents with their own prompt are left alone.
 */
export async function registerPrompt(host: Host, o: TonyOptions, detect: (dir: string) => string[] = detectChecks): Promise<void> {
  if (!o.prompt.enabled) return
  // Built once per session: the text must not change between requests, or the prompt cache misses.
  const additions = new Map<string, string>()
  const additionFor = async (sessionID: string) => {
    let a = additions.get(sessionID)
    if (a === undefined) {
      let checks: string[]
      try {
        checks = o.gate.checks.length > 0 ? o.gate.checks : detect((await host.sessionInfo(sessionID)).directory)
      } catch {
        checks = []
      }
      additions.set(sessionID, (a = promptAddition(checks, o.prompt.review)))
    }
    return a
  }
  await host.onContext(async (e) => {
    const first = e.system[0]
    if (!first) return
    if (await host.agentHasCustomSystem(e.agent)) return
    e.system[0] = { ...first, text: `${first.text}\n\n${await additionFor(e.sessionID)}` }
  })
}
