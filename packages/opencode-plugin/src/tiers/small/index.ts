import type { Tier } from "../types.ts"
import { registerLocalContext } from "./context.ts"
import { isLocal } from "./match.ts"
import { SMALL_PROMPT } from "./prompt.ts"

/** Small and local models (llama.cpp, ollama, ...). */
export const small: Tier = {
  id: "small",
  label: "Tony for small models",
  matches: (model, o) => isLocal(model.providerID, o.local),
  prompt: SMALL_PROMPT,
  // Local servers run with a fixed window; cap it so compaction fires before the server truncates.
  register: (host, o) => registerLocalContext(host, o.local),
}
