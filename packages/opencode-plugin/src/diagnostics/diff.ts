const MAX_LINES = 20

/** Drops line/column positions so the same problem matches after lines shift. */
export function normalize(line: string): string {
  return line
    .replace(/\(\d+,\d+\)/g, "")
    .replace(/:\d+(:\d+)?/g, "")
    .trim()
}

// Totals change with every new problem and would always look new.
const SUMMARY = /^(found \d+|\d+ (errors?|problems?|warnings?)\b|all checks passed)/i

/** The checker's output lines, without blank lines and totals. */
export function problemLines(output: string): string[] {
  return output
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !SUMMARY.test(l.trim()))
}

/** Lines in `after` that were not already in `before`, compared without positions. */
export function newProblems(before: readonly string[], after: readonly string[]): string[] {
  const remaining = new Map<string, number>()
  for (const l of before) remaining.set(normalize(l), (remaining.get(normalize(l)) ?? 0) + 1)
  const fresh: string[] = []
  for (const l of after) {
    const n = remaining.get(normalize(l)) ?? 0
    if (n > 0) remaining.set(normalize(l), n - 1)
    else fresh.push(l)
  }
  return fresh
}

export function formatDiagnostics(file: string, lines: readonly string[]): string {
  const shown = lines.slice(0, MAX_LINES)
  const more = lines.length > MAX_LINES ? `\n…and ${lines.length - MAX_LINES} more` : ""
  return `\n\n<diagnostics file="${file}">\nNew problems after this edit:\n${shown.join("\n")}${more}\n</diagnostics>`
}
