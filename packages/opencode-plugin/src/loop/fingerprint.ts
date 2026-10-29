function canonical(value: unknown): string {
  if (value === undefined) return '"<undef>"'
  if (typeof value === "string") return JSON.stringify(value.replace(/\s+/g, " ").trim())
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value) ?? String(value)
}

/** Stable key for a tool call: same tool and same input give the same string. */
export function fingerprint(tool: string, input: unknown): string {
  return `${tool}:${canonical(input)}`
}
