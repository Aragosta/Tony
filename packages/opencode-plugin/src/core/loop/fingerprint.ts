function canonical(value: unknown): string {
  if (value === undefined) return '"<undef>"'
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value) ?? String(value)
}

/**
 * Stable key for a tool call: same tool and same input give the same string. Whitespace is only normalized in
 * shell commands; elsewhere (edit, write) indentation is meaningful and a re-indented retry is a different call.
 */
export function fingerprint(tool: string, input: unknown): string {
  if (tool === "shell" && typeof input === "object" && input !== null && typeof (input as any).command === "string") {
    input = { ...input, command: (input as any).command.replace(/\s+/g, " ").trim() }
  }
  return `${tool}:${canonical(input)}`
}
