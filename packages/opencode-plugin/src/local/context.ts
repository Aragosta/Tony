import type { ContextCap, Host, ModelEntry } from "../host.ts"
import type { LocalOptions } from "../options.ts"
import { isLocal } from "../prompt/select.ts"

/**
 * Local servers run with a fixed window (llama-server -c, OLLAMA_CONTEXT_LENGTH), but opencode may assume the
 * model's trained maximum. Cap local models at the server window so compaction starts before the server truncates.
 * A smaller known window is never raised. opencode records an unknown window as 0.
 */
export function planContextCaps(models: readonly ModelEntry[], local: LocalOptions): ContextCap[] {
  return models
    .filter((m) => isLocal(m.providerID, local))
    .filter((m) => m.context === undefined || m.context <= 0 || m.context > local.contextLimit)
    .map((m) => ({ providerID: m.providerID, id: m.id, context: local.contextLimit }))
}

export async function registerLocalContext(host: Host, local: LocalOptions): Promise<void> {
  await host.onModels((models) => planContextCaps(models, local))
}
