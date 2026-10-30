import { expect, test } from "bun:test"
import { assemblePrompt, toolGuidance } from "../src/core/prompt/select.ts"
import { BASE } from "../src/core/prompt/text.ts"
import { DEFAULTS, parseOptions } from "../src/options.ts"
import { frontier } from "../src/tiers/frontier/index.ts"
import { selectTier, TIERS } from "../src/tiers/index.ts"
import { small } from "../src/tiers/small/index.ts"
import { isLocal } from "../src/tiers/small/match.ts"

test("auto: local providers get the small tier, everything else frontier", () => {
  expect(selectTier({ providerID: "llamacpp", id: "local" }, DEFAULTS).id).toBe("small")
  expect(selectTier({ providerID: "ollama", id: "q" }, DEFAULTS).id).toBe("small")
  expect(selectTier({ providerID: "anthropic", id: "x" }, DEFAULTS).id).toBe("frontier")
})

test("an explicit tier wins over auto", () => {
  expect(selectTier({ providerID: "anthropic", id: "x" }, { ...DEFAULTS, tier: "small" }).id).toBe("small")
  expect(selectTier({ providerID: "llamacpp", id: "x" }, { ...DEFAULTS, tier: "frontier" }).id).toBe("frontier")
})

test("tier option is validated", () => {
  expect(parseOptions({}).tier).toBe("auto")
  expect(parseOptions({ tier: "small" }).tier).toBe("small")
  expect(() => parseOptions({ tier: "huge" })).toThrow("tier must be auto or one of: small, frontier")
})

test("every tier has a unique id and label, and frontier is the catch-all last", () => {
  expect(new Set(TIERS.map((t) => t.id)).size).toBe(TIERS.length)
  expect(new Set(TIERS.map((t) => t.label)).size).toBe(TIERS.length)
  expect(TIERS.at(-1)).toBe(frontier)
})

test("case-insensitive provider match", () => {
  expect(isLocal("Ollama", DEFAULTS.local)).toBe(true)
})

test("the core prompt comes first, the tier's text last", () => {
  for (const tier of TIERS) {
    const p = assemblePrompt([], tier)
    expect(p.startsWith(BASE)).toBe(true)
    expect(p.endsWith(tier.prompt)).toBe(true)
  }
})

test("parallel read-only calls are suggested to frontier models only", () => {
  expect(frontier.prompt).toContain("together in one turn")
  expect(small.prompt).not.toContain("together in one turn")
})

test("guidance follows tools", () => {
  const one = toolGuidance(["todowrite"])
  expect(one).toHaveLength(1)
  expect(one[0]).toContain("todowrite")
  expect(toolGuidance([])).toEqual([])
  expect(toolGuidance(["shell", "edit", "todowrite", "subagent", "websearch"])).toHaveLength(5)
})

test("guidance appears under a heading", () => {
  expect(assemblePrompt(["edit"], frontier)).toContain("# Tools\n- ")
})

test("the base prompt asks for a check of every part of the request", () => {
  expect(BASE).toContain("re-read the user's request")
})

test("the base prompt forbids faking and offers the Blocked: exit", () => {
  expect(BASE).toContain("Never hard-code expected outputs")
  expect(BASE).toContain("start your final answer with `Blocked:`")
})

test("small models get a verification order and no re-reads after edits", () => {
  expect(small.prompt).toContain("Verify in this order, then stop")
  expect(small.prompt).toContain("Don't re-read a file after a successful edit")
})
