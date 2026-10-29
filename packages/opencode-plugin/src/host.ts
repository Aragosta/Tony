// The narrow surface Tony needs from opencode. Only src/index.ts maps this to the real plugin API.

export type TextPart = { type: string; text?: string }

export interface ToolBeforeEvent {
  tool: string
  sessionID: string
  input: unknown
}

export type ToolAfterEvent = { tool: string; sessionID: string; input: unknown } & (
  | { status: "completed"; result: { content?: string | ReadonlyArray<TextPart>; output?: unknown } }
  | { status: "error"; error?: { message?: string } }
)

/** A new prompt (user message or other input) arrived for a session. */
export interface PromptEvent {
  sessionID: string
}

export interface ContextEvent {
  agent: string
  model: { providerID: string; id: string }
  system: Array<{ text: string }>
  tools: Record<string, unknown>
}

export interface ModelEntry {
  providerID: string
  id: string
  context: number | undefined
}

export interface ContextCap {
  providerID: string
  id: string
  context: number
}

export interface Host {
  /** A throw from the callback rejects the tool call; the model sees the message. */
  onToolBefore(cb: (e: ToolBeforeEvent) => void | Promise<void>): Promise<void>
  onToolAfter(cb: (e: ToolAfterEvent) => void | Promise<void>): Promise<void>
  onContext(cb: (e: ContextEvent) => void | Promise<void>): Promise<void>
  onPrompt(cb: (e: PromptEvent) => void | Promise<void>): Promise<void>
  /** The top-level session a (sub)session belongs to; itself when it has no parent. */
  rootSession(sessionID: string): Promise<string>
  interrupt(sessionID: string): Promise<void>
  agentHasCustomSystem(agentID: string): Promise<boolean>
  /** `plan` sees every available model and returns the context limits to set. */
  onModels(plan: (models: readonly ModelEntry[]) => readonly ContextCap[]): Promise<void>
}
