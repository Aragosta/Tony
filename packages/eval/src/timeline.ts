// Rebuilds a run, step by step, from `opencode run --format json --thinking` output: what the model thought, said and
// called, and what each call returned. Steps are grouped by assistant message, so tool results that arrive after a
// step's `step_finish` still land in their step.

export interface ToolCall {
  tool: string
  input: Record<string, unknown>
  status: "completed" | "error"
  /** The result text the model saw (for errors, the error message). */
  output: string
  /** Shell exit code, when the tool reported one. */
  exit?: number
  ms: number
}

export interface Step {
  /** 1-based. */
  index: number
  startedAt?: number
  endedAt?: number
  reasoning: string
  text: string
  calls: ToolCall[]
  /** Why the model stopped this step: `tool-calls`, `stop`, `length`, ... */
  finish?: string
  tokens: { input: number; output: number; reasoning: number; cacheRead: number }
}

export interface Timeline {
  steps: Step[]
  /** opencode errors (provider failures, interrupts). */
  errors: string[]
  startedAt?: number
  endedAt?: number
}

type Json = Record<string, any>

const num = (v: unknown) => (typeof v === "number" ? v : 0)
const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v))

function errorText(error: unknown): string {
  if (typeof error === "string") return error
  if (typeof error === "object" && error !== null && typeof (error as Json).message === "string") return (error as Json).message
  return str(error)
}

export function buildTimeline(lines: readonly string[]): Timeline {
  const steps: Step[] = []
  const byMessage = new Map<string, Step>()
  const errors: string[] = []
  let current: Step | undefined
  let startedAt: number | undefined
  let endedAt: number | undefined

  const open = (messageID: unknown, at: number | undefined): Step => {
    const key = typeof messageID === "string" ? messageID : undefined
    const known = key ? byMessage.get(key) : undefined
    if (known) return known
    // Without a message ID, events belong to the step that is open.
    if (!key && current) return current
    const step: Step = { index: steps.length + 1, ...(at ? { startedAt: at } : {}), reasoning: "", text: "", calls: [], tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 } }
    steps.push(step)
    if (key) byMessage.set(key, step)
    return step
  }

  for (const line of lines) {
    let e: Json
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof e !== "object" || e === null) continue
    const at = typeof e.timestamp === "number" ? e.timestamp : undefined
    if (at) {
      startedAt ??= at
      endedAt = at
    }
    const part: Json = e.part ?? {}
    switch (e.type) {
      case "step_start":
        current = open(part.messageID, at)
        break
      case "reasoning": {
        const s = open(part.messageID, at)
        s.reasoning += (s.reasoning ? "\n" : "") + str(part.text)
        break
      }
      case "text": {
        const s = open(part.messageID, at)
        s.text += (s.text ? "\n" : "") + str(part.text)
        break
      }
      case "tool_use": {
        const s = open(part.messageID, at)
        const state: Json = part.state ?? {}
        const exit = state.metadata?.metadata?.exit
        const time: Json = state.time ?? {}
        s.calls.push({
          tool: str(part.tool),
          input: typeof state.input === "object" && state.input !== null ? state.input : {},
          status: state.status === "error" ? "error" : "completed",
          output: state.status === "error" ? errorText(state.error) : str(state.output),
          ...(typeof exit === "number" ? { exit } : {}),
          ms: num(time.end) - num(time.start),
        })
        break
      }
      case "step_finish": {
        const s = open(part.messageID, at)
        if (at) s.endedAt = at
        if (typeof part.reason === "string") s.finish = part.reason
        const t: Json = part.tokens ?? {}
        s.tokens.input += num(t.input)
        s.tokens.output += num(t.output)
        s.tokens.reasoning += num(t.reasoning)
        s.tokens.cacheRead += num(t.cache?.read)
        break
      }
      case "error":
        errors.push(errorText(e.error))
        break
    }
  }
  return { steps, errors, ...(startedAt ? { startedAt } : {}), ...(endedAt ? { endedAt } : {}) }
}

/** The model's last words: the text of the last step that has any. */
export function finalText(t: Timeline): string {
  for (let i = t.steps.length - 1; i >= 0; i--) if (t.steps[i]!.text.trim()) return t.steps[i]!.text
  return ""
}
