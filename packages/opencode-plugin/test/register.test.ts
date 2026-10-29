import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ToolBeforeEvent } from "../src/host.ts"
import { DEFAULTS } from "../src/options.ts"
import { registerTony } from "../src/register.ts"
import { createFakeHost } from "./fake-host.ts"

let statusFile = ""
let savedStatus: string | undefined
beforeEach(() => {
  savedStatus = process.env.TONY_STATUS_FILE
  statusFile = join(mkdtempSync(join(tmpdir(), "tony-status-")), "status.jsonl")
  process.env.TONY_STATUS_FILE = statusFile
})
afterEach(() => {
  if (savedStatus === undefined) delete process.env.TONY_STATUS_FILE
  else process.env.TONY_STATUS_FILE = savedStatus
})
const statuses = () => (existsSync(statusFile) ? readFileSync(statusFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [])

async function setup() {
  const f = createFakeHost()
  const dir = mkdtempSync(join(tmpdir(), "tony-reg-"))
  mkdirSync(join(dir, "test"))
  writeFileSync(join(dir, "test/cli.test.ts"), "test('a', () => expect(1).toBe(1))\n")
  f.sessions.set("s", { directory: dir })
  f.transcripts.set("s", [
    { type: "user", text: "add a test" },
    { type: "assistant", text: "Test added.", tools: [], files: [] },
  ])
  const calls: string[] = []
  await registerTony(f.host, DEFAULTS, {
    exec: async (command) => (calls.push(command), { code: 0, output: "", timedOut: false }),
    detect: () => ["bun test"],
  })
  return { f, dir, calls }
}
const write = { tool: "write", sessionID: "s", input: { path: "test/cli.test.ts", content: "test('a', () => expect(1).toBe(1))\ntest('b', () => expect(2).toBe(2))\n" } }
const completed = (e: { tool: string; sessionID: string; input: unknown }) => ({ ...e, status: "completed" as const, result: {} })

// Regression: opencode fires no after-hook for a call a before-hook refused, so the gate must hear about it from the guard.
test("an edit-guard refusal followed by 'done' sends the agent back", async () => {
  const { f } = await setup()
  expect(await f.call(write, completed)).toContain("Edit refused")
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(f.continued[0]!.description).toContain("edits refused")
  expect(f.continued[0]!.text).toContain("Edit refused")
})

test("redoing the refused edit after a read verifies", async () => {
  const { f, dir } = await setup()
  await f.call(write, completed)
  await f.call({ tool: "read", sessionID: "s", input: { path: "test/cli.test.ts" } }, completed)
  // The tool runs only if no before-hook refused it.
  const run = (e: ToolBeforeEvent) => (writeFileSync(join(dir, "test/cli.test.ts"), (e.input as { content: string }).content), completed(e))
  expect(await f.call(write, run)).toBeUndefined()
  await f.idle("s")
  expect(f.continued).toEqual([])
  expect(statuses().at(-1).status).toBe("verified")
})

test("an unrelated edit after the refusal does not hide it", async () => {
  const { f, dir } = await setup()
  await f.call(write, completed)
  writeFileSync(join(dir, "a.ts"), "x")
  await f.call({ tool: "read", sessionID: "s", input: { path: "a.ts" } }, completed)
  expect(await f.call({ tool: "write", sessionID: "s", input: { path: "a.ts", content: "y" } }, completed)).toBeUndefined()
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(f.continued[0]!.description).toContain("edits refused")
})
