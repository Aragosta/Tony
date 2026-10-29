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

export interface EditGuardOptions {
  enabled: boolean
}

/** Runs `command` (with `{file}` replaced by the edited file) when `requires` is available. */
export interface DiagnosticChecker {
  extensions: string[]
  command: string
  /** A path relative to the project that must exist, or a command that must be on PATH. */
  requires: string
}

export interface DiagnosticsOptions {
  enabled: boolean
  timeoutMs: number
  checkers: DiagnosticChecker[]
}

export interface GateOptions {
  enabled: boolean
  maxRounds: number
  /** Project checks to run; empty means auto-detect. */
  checks: string[]
  checkTimeoutMs: number
  judge: boolean
}

export interface TonyOptions {
  loopGuard: LoopGuardOptions
  prompt: PromptOptions
  local: LocalOptions
  editGuard: EditGuardOptions
  diagnostics: DiagnosticsOptions
  gate: GateOptions
}

/** On Windows, npm's `.bin/tsc` is a shell script; cmd.exe runs `tsc.cmd`. */
export function defaultCheckers(platform: NodeJS.Platform = process.platform): DiagnosticChecker[] {
  const tsc =
    platform === "win32"
      ? { command: "node_modules\\.bin\\tsc.cmd --noEmit --pretty false", requires: "node_modules/.bin/tsc.cmd" }
      : { command: "node_modules/.bin/tsc --noEmit --pretty false", requires: "node_modules/.bin/tsc" }
  return [
    { extensions: [".ts", ".tsx", ".mts", ".cts"], ...tsc },
    { extensions: [".py"], command: "ruff check --output-format concise {file}", requires: "ruff" },
    { extensions: [".go"], command: "go vet ./...", requires: "go" },
  ]
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
  editGuard: { enabled: true },
  diagnostics: { enabled: true, timeoutMs: 20000, checkers: defaultCheckers() },
  gate: { enabled: true, maxRounds: 3, checks: [], checkTimeoutMs: 300000, judge: false },
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
    editGuard: section(DEFAULTS.editGuard, raw.editGuard),
    diagnostics: section(DEFAULTS.diagnostics, raw.diagnostics),
    gate: section(DEFAULTS.gate, raw.gate),
  }
  if (opts.loopGuard.blockAt < 2) throw new Error("blockAt must be >= 2")
  if (opts.loopGuard.stopAt <= opts.loopGuard.blockAt) throw new Error("stopAt must be > blockAt")
  if (opts.local.contextLimit < 32768) throw new Error("contextLimit must be >= 32768")
  if (opts.gate.maxRounds < 1) throw new Error("maxRounds must be >= 1")
  if (!Array.isArray(opts.gate.checks) || !opts.gate.checks.every((c) => typeof c === "string")) {
    throw new Error("gate.checks must be an array of strings")
  }
  return opts
}
