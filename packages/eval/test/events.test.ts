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
    trace: ["shell git log", "shell git log", "✗ shell git log", "✗ shell git log"],
  })
})

test("trace names the path or pattern and truncates long inputs", () => {
  const call = (tool: string, input: unknown) =>
    JSON.stringify({ type: "tool_use", part: { tool, state: { status: "completed", input } } })
  const m = parseEvents([call("read", { path: "src/a.ts" }), call("grep", { pattern: "foo" }), call("shell", { command: "x".repeat(200) }), call("todowrite", { todos: [] })])
  expect(m.trace.slice(0, 2)).toEqual(["read src/a.ts", "grep foo"])
  expect(m.trace[2]!.length).toBe(100)
  expect(m.trace[3]).toBe('todowrite {"todos":[]}')
})

test("ignores non-JSON lines", () => {
  const m = parseEvents(["garbage", ""])
  expect(m.steps).toBe(0)
})
