import { describe, expect, test } from "bun:test"
import { DEFAULTS, defaultCheckers, parseOptions } from "../src/options.ts"

describe("parseOptions", () => {
  test("defaults when undefined", () => {
    expect(parseOptions(undefined)).toEqual(DEFAULTS)
  })

  test("merges per section", () => {
    const o = parseOptions({ loopGuard: { blockAt: 4, stopAt: 6 } })
    expect(o.loopGuard.blockAt).toBe(4)
    expect(o.loopGuard.stopAt).toBe(6)
    expect(o.loopGuard.mutationTools).toEqual(DEFAULTS.loopGuard.mutationTools)
    expect(o.prompt).toEqual(DEFAULTS.prompt)
  })

  test("local defaults", () => {
    expect(DEFAULTS.local.contextLimit).toBe(131072)
    expect(DEFAULTS.local.providers).toContain("llamacpp")
  })

  test("rejects tiny context", () => {
    expect(() => parseOptions({ local: { contextLimit: 8000 } })).toThrow("contextLimit must be >= 32768")
  })

  test("rejects bad thresholds", () => {
    expect(() => parseOptions({ loopGuard: { blockAt: 1 } })).toThrow("blockAt must be >= 2")
    expect(() => parseOptions({ loopGuard: { blockAt: 3, stopAt: 3 } })).toThrow("stopAt must be > blockAt")
  })

  test("rejects non-object", () => {
    expect(() => parseOptions("x")).toThrow("tony options must be an object")
  })
})

describe("phase 2 options", () => {
  test("phase 2 defaults", () => {
    expect(DEFAULTS.gate.maxRounds).toBe(3)
    expect(DEFAULTS.gate.judge).toBe(false)
    expect(DEFAULTS.editGuard.enabled).toBe(true)
    expect(DEFAULTS.diagnostics.checkers[0]!.extensions).toContain(".ts")
  })

  test("rejects zero rounds", () => {
    expect(() => parseOptions({ gate: { maxRounds: 0 } })).toThrow("maxRounds must be >= 1")
  })

  test("rejects non-array checks", () => {
    expect(() => parseOptions({ gate: { checks: "npm test" } })).toThrow("gate.checks must be an array of strings")
  })
})

test("default checkers fit the platform", () => {
  const tsc = (p: NodeJS.Platform) => defaultCheckers(p).find((c) => c.extensions.includes(".ts"))!
  expect(tsc("linux")).toMatchObject({ command: "node_modules/.bin/tsc --noEmit --pretty false", requires: "node_modules/.bin/tsc" })
  expect(tsc("win32")).toMatchObject({ command: "node_modules\\.bin\\tsc.cmd --noEmit --pretty false", requires: "node_modules/.bin/tsc.cmd" })
})
