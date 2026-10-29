// Parses `opencode run --format json` output (one JSON event per line) into run metrics.

export interface Tokens {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface RunMetrics {
  steps: number
  toolCalls: number
  toolErrors: number
  blocked: number
  stopped: boolean
  maxIdenticalStreak: number
  tokens: Tokens
  errors: string[]
  finalText: string
}

type Json = Record<string, any>

function parse(line: string): Json | undefined {
  try {
    const v = JSON.parse(line)
    return typeof v === "object" && v !== null ? v : undefined
  } catch {
    return undefined
  }
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error
  if (typeof error === "object" && error !== null && typeof (error as Json).message === "string") return (error as Json).message
  return ""
}

const num = (v: unknown) => (typeof v === "number" ? v : 0)

export function parseEvents(lines: readonly string[]): RunMetrics {
  const m: RunMetrics = {
    steps: 0,
    toolCalls: 0,
    toolErrors: 0,
    blocked: 0,
    stopped: false,
    maxIdenticalStreak: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    errors: [],
    finalText: "",
  }
  let lastCall: string | undefined
  let streak = 0
  let stepText = ""

  for (const line of lines) {
    const e = parse(line)
    if (!e) continue
    const part: Json = e.part ?? {}
    switch (e.type) {
      case "step_start":
        stepText = ""
        break
      case "text":
        if (typeof part.text === "string") stepText += part.text
        m.finalText = stepText
        break
      case "step_finish": {
        m.steps++
        const t: Json = part.tokens ?? {}
        m.tokens.input += num(t.input)
        m.tokens.output += num(t.output)
        m.tokens.reasoning += num(t.reasoning)
        m.tokens.cacheRead += num(t.cache?.read)
        m.tokens.cacheWrite += num(t.cache?.write)
        break
      }
      case "tool_use": {
        m.toolCalls++
        const state: Json = part.state ?? {}
        const call = `${part.tool}:${JSON.stringify(state.input ?? null)}`
        streak = call === lastCall ? streak + 1 : 1
        lastCall = call
        m.maxIdenticalStreak = Math.max(m.maxIdenticalStreak, streak)
        if (state.status === "error") {
          m.toolErrors++
          const text = errorText(state.error)
          if (text.startsWith("Blocked:")) m.blocked++
          if (text.startsWith("Stopped:")) m.stopped = true
        }
        break
      }
      case "error":
        m.errors.push(errorText(e.error) || JSON.stringify(e.error ?? null))
        break
    }
  }
  return m
}
