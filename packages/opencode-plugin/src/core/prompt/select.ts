import type { Tier } from "../../tiers/types.ts"
import { BASE } from "./text.ts"

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

/** The project's check commands, so the model runs these instead of guessing a test runner. */
export function checksSection(checks: readonly string[]): string {
  return `# This project\n- Checks: ${checks.map((c) => "`" + c + "`").join(", ")}. Run them to verify your change; they also run automatically when you finish.`
}

/** The core prompt every model gets (base rules, guidance for its tools, the project's checks), then the tier's text. */
export function assemblePrompt(tools: readonly string[], tier: Tier, checks: readonly string[] = []): string {
  let prompt = BASE
  const lines = toolGuidance(tools)
  if (lines.length > 0) prompt += "\n\n# Tools\n" + lines.join("\n")
  if (checks.length > 0) prompt += "\n\n" + checksSection(checks)
  return prompt + "\n\n" + tier.prompt
}
