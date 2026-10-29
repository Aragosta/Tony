import type { ToolAfterEvent } from "./host.ts"

/** What the model saw from a call: text content, else structured output, else the error message. */
export function resultText(e: ToolAfterEvent): string | undefined {
  if (e.status === "error") return e.error?.message
  const { content, output } = e.result
  if (typeof content === "string") return content
  const parts = (content ?? []).filter((p) => typeof p.text === "string").map((p) => p.text)
  if (parts.length > 0) return parts.join("\n")
  if (output === undefined) return undefined
  return typeof output === "string" ? output : JSON.stringify(output)
}
