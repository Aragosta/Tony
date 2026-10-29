import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { parseEvents } from "../src/events.ts"

test("parses the fixture", () => {
  const lines = readFileSync(new URL("./fixtures/run.jsonl", import.meta.url), "utf8").split("\n")
  expect(parseEvents(lines)).toEqual({
    steps: 2,
    toolCalls: 4,
    toolErrors: 2,
    blocked: 1,
    stopped: true,
    maxIdenticalStreak: 4,
    tokens: { input: 200, output: 20, reasoning: 0, cacheRead: 100, cacheWrite: 10 },
    errors: ["boom"],
    finalText: "done",
  })
})

test("ignores non-JSON lines", () => {
  const m = parseEvents(["garbage", ""])
  expect(m.steps).toBe(0)
})
