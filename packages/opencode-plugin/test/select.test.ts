import { expect, test } from "bun:test"
import { DEFAULTS } from "../src/options.ts"
import { isLocal, selectPrompt, toolGuidance } from "../src/prompt/select.ts"
import { BASE, LOCAL } from "../src/prompt/text.ts"

test("base always included", () => {
  const p = selectPrompt({ providerID: "anthropic", id: "x" }, [], DEFAULTS.local)
  expect(p.startsWith(BASE)).toBe(true)
  expect(p).not.toContain(LOCAL)
})

test("local addendum for local providers", () => {
  const p = selectPrompt({ providerID: "ollama", id: "x" }, [], DEFAULTS.local)
  expect(p.endsWith(LOCAL)).toBe(true)
})

test("guidance follows tools", () => {
  const one = toolGuidance(["todowrite"])
  expect(one).toHaveLength(1)
  expect(one[0]).toContain("todowrite")
  expect(toolGuidance([])).toEqual([])
  expect(toolGuidance(["shell", "edit", "todowrite", "subagent", "websearch"])).toHaveLength(5)
})

test("guidance appears under a heading", () => {
  expect(selectPrompt({ providerID: "anthropic", id: "x" }, ["edit"], DEFAULTS.local)).toContain("# Tools\n- ")
})

test("case-insensitive provider match", () => {
  expect(isLocal("Ollama", DEFAULTS.local)).toBe(true)
})
