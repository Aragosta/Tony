import type { LocalOptions } from "../options.ts"
import { BASE, LOCAL } from "./text.ts"

const GUIDANCE: ReadonlyArray<[tool: string, line: string]> = [
  ["shell", "- Prefer read, grep, glob and edit over shell equivalents; use `shell` for builds, tests, git and other commands."],
  ["edit", "- Use `edit` with `oldString` copied exactly from the file as you last read it; re-read the file if it may have changed."],
  ["todowrite", "- For work with three or more steps, keep a todo list with `todowrite` and mark each item done as soon as it is done."],
  ["subagent", "- Delegate broad codebase searches to the `explore` subagent with a precise question, so your own context stays small."],
  ["websearch", "- Check facts that may have changed since your training (library APIs, versions, CLI flags) with `websearch` or `webfetch` before relying on them."],
]

export function toolGuidance(tools: readonly string[]): string[] {
  const present = new Set(tools)
  return GUIDANCE.filter(([tool]) => present.has(tool)).map(([, line]) => line)
}

export function isLocal(providerID: string, local: LocalOptions): boolean {
  const id = providerID.toLowerCase()
  return local.providers.some((p) => p.toLowerCase() === id)
}

export function selectPrompt(model: { providerID: string; id: string }, tools: readonly string[], local: LocalOptions): string {
  let prompt = BASE
  const lines = toolGuidance(tools)
  if (lines.length > 0) prompt += "\n\n# Tools\n" + lines.join("\n")
  if (isLocal(model.providerID, local)) prompt += "\n\n" + LOCAL
  return prompt
}
