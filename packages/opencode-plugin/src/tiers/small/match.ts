import type { LocalOptions } from "../../options.ts"

/** Providers that serve models from the user's machine (llama.cpp, ollama, ...), from `local.providers`. */
export function isLocal(providerID: string, local: LocalOptions): boolean {
  const id = providerID.toLowerCase()
  return local.providers.some((p) => p.toLowerCase() === id)
}
