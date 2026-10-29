import { describe, expect, test } from "bun:test"
import { DEFAULTS, parseOptions } from "../src/options.ts"

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
