import type { Tier } from "../../tiers/types.ts"
import { BASE } from "./text.ts"

const GUIDANCE: ReadonlyArray<[tool: string, line: string]> = [
  ["shell", "- Prefer read, grep, glob and edit over shell equivalents; use `shell` for builds, tests, git and other commands."],
  ["edit", "- Use `edit` with `oldString` copied exactly from the file as you last read it."],
  ["todowrite", "- Use `todowrite` only for tasks with four or more distinct steps across several files. Skip it for a single fix, a rename or a few edits; just do the work."],
  ["subagent", "- Delegate broad codebase searches to the `explore` subagent with a precise question."],
  ["websearch", "- Check facts that may have changed since your training (library APIs, versions) with `websearch` or `webfetch`."],
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
  return tier.prompt ? prompt + "\n\n" + tier.prompt : prompt
}
