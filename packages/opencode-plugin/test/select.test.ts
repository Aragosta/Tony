import { expect, test } from "bun:test"
import { DEFAULTS } from "../src/options.ts"
import { isLocal, selectPrompt, toolGuidance } from "../src/prompt/select.ts"
import { BASE, LOCAL, PARALLEL } from "../src/prompt/text.ts"

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

test("parallel read-only calls are suggested to hosted models only", () => {
  expect(selectPrompt({ providerID: "anthropic", id: "m" }, [], DEFAULTS.local)).toContain(PARALLEL)
  expect(selectPrompt({ providerID: "llamacpp", id: "m" }, [], DEFAULTS.local)).not.toContain(PARALLEL)
})

test("the base prompt asks for a check of every part of the request", () => {
  expect(BASE).toContain("re-read the user's request")
})
