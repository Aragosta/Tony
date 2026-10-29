export interface LoopGuardOptions {
  enabled: boolean
  blockAt: number
  stopAt: number
  mutationTools: string[]
  exemptTools: string[]
}

export interface PromptOptions {
  enabled: boolean
}

export interface LocalOptions {
  providers: string[]
  contextLimit: number
}

export interface TonyOptions {
  loopGuard: LoopGuardOptions
  prompt: PromptOptions
  local: LocalOptions
}

export const DEFAULTS: TonyOptions = {
  loopGuard: {
    enabled: true,
    blockAt: 3,
    stopAt: 5,
    mutationTools: ["edit", "write", "patch"],
    exemptTools: ["question", "todowrite"],
  },
  prompt: { enabled: true },
  local: {
    providers: ["ollama", "lmstudio", "llamacpp", "vllm", "local"],
    contextLimit: 131072,
  },
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function section<T extends object>(defaults: T, raw: unknown): T {
  return isObject(raw) ? { ...defaults, ...raw } : { ...defaults }
}

export function parseOptions(raw: unknown): TonyOptions {
  if (raw === undefined || raw === null) raw = {}
  if (!isObject(raw)) throw new Error("tony options must be an object")
  const opts: TonyOptions = {
    loopGuard: section(DEFAULTS.loopGuard, raw.loopGuard),
    prompt: section(DEFAULTS.prompt, raw.prompt),
    local: section(DEFAULTS.local, raw.local),
  }
  if (opts.loopGuard.blockAt < 2) throw new Error("blockAt must be >= 2")
  if (opts.loopGuard.stopAt <= opts.loopGuard.blockAt) throw new Error("stopAt must be > blockAt")
  if (opts.local.contextLimit < 32768) throw new Error("contextLimit must be >= 32768")
  return opts
}
