import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EvidenceTracker } from "../src/core/gate/evidence.ts"
import { registerGate } from "../src/core/gate/register.ts"
import { DEFAULTS, type GateOptions } from "../src/options.ts"
import type { Exec, ExecResult } from "../src/core/verify/exec.ts"
import { createFakeHost } from "./fake-host.ts"
import type { TierId } from "../src/tiers/index.ts"

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

async function setup(results: Partial<ExecResult>[] = [], opts: Partial<GateOptions> = {}, checks = ["bun test"], tiers?: Map<string, TierId>) {
  const f = createFakeHost()
  const dir = mkdtempSync(join(tmpdir(), "tony-gate-"))
  f.sessions.set("s", { directory: dir })
  f.transcripts.set("s", [
    { type: "user", text: "do it" },
    { type: "assistant", text: "Done.", tools: [], files: [] },
  ])
  const calls: string[] = []
  const exec: Exec = async (command) => {
    calls.push(command)
    return { code: 0, output: "", timedOut: false, ...(results.shift() ?? {}) }
  }
  await registerGate(f.host, { ...DEFAULTS.gate, ...opts }, { exec, detect: () => checks, tracker: new EvidenceTracker(), ...(tiers ? { tiers } : {}) })
  return { f, calls }
}
const edit = (path = "a.ts") => ({ tool: "edit", sessionID: "s", input: { path }, status: "completed" as const, result: {} })
const todo = (status: string) => ({
  tool: "todowrite",
  sessionID: "s",
  input: { todos: [{ content: "write docs", status }] },
  status: "completed" as const,
  result: {},
})

test("failing checks send the agent back once", async () => {
  const { f } = await setup([{ code: 1, output: "1 fail" }])
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(f.continued[0]!.text).toContain("The project's checks fail:")
  expect(f.continued[0]!.text).toContain("1 fail")
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(statuses().at(-1).status).toBe("unresolved")
})

test("the status record names the session's tier", async () => {
  const { f } = await setup([{ code: 0 }], {}, ["bun test"], new Map([["s", "small"]]))
  await f.after(edit())
  await f.idle("s")
  expect(statuses().at(-1).tier).toBe("small")
})

test("verified when checks pass", async () => {
  const { f } = await setup([{ code: 0 }])
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
  expect(statuses().at(-1).status).toBe("verified")
})

test("checks rerun only after new changes", async () => {
  const { f, calls } = await setup([{ code: 0 }, { code: 0 }])
  await f.after(edit())
  await f.idle("s")
  await f.idle("s")
  expect(calls).toHaveLength(1)
})

test("round cap stops the gate", async () => {
  const { f } = await setup([{ code: 0 }, { code: 1, output: "boom" }], { maxRounds: 1 })
  await f.after(edit())
  await f.after(todo("pending"))
  await f.idle("s")
  await f.after(edit("b.ts"))
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(statuses().at(-1).status).toBe("unresolved")
})

test("subagent sessions are skipped", async () => {
  const { f, calls } = await setup()
  f.sessions.set("child", { directory: process.cwd(), parentID: "s" })
  await f.idle("child")
  expect(calls).toEqual([])
  expect(f.continued).toEqual([])
  expect(statuses()).toEqual([])
})

test("background work defers the gate", async () => {
  const { f, calls } = await setup()
  await f.after(edit())
  await f.idle("s", [{ kind: "shell", sessionID: "s" }])
  expect(calls).toEqual([])
  expect(statuses()).toEqual([])
})

test("new prompt resets rounds", async () => {
  const { f } = await setup()
  await f.after(todo("pending"))
  await f.idle("s")
  await f.prompt("s")
  await f.after(todo("pending"))
  await f.idle("s")
  expect(f.continued).toHaveLength(2)
})

test("judge continue", async () => {
  const { f } = await setup([{ code: 0 }], { judge: true })
  f.judgeReplies.push('{"verdict":"continue","reason":"README not updated","next_step":"update README"}')
  await f.after(edit())
  await f.idle("s")
  expect(f.continued[0]!.text).toContain("README not updated")
  expect(f.judgePrompts[0]).toContain("- bun test: passed")
})

test("judge blocked", async () => {
  const { f } = await setup([{ code: 0 }], { judge: true })
  f.judgeReplies.push('{"verdict":"blocked","reason":"needs API key"}')
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
  expect(statuses().at(-1).status).toBe("needs-user")
})

test("invalid judge reply lets it stop", async () => {
  const { f } = await setup([{ code: 0 }], { judge: true })
  f.judgeReplies.push("ok")
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
  expect(statuses().at(-1)).toMatchObject({ status: "verified", judge: "invalid" })
})

test("gate errors never block", async () => {
  const { f } = await setup()
  f.host.transcript = async () => {
    throw new Error("boom")
  }
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
})

const shell = (command: string, exit: number) => ({
  tool: "shell",
  sessionID: "s",
  input: { command },
  status: "completed" as const,
  result: { metadata: { exit } },
})

test("checks the agent already passed after its last change are not rerun", async () => {
  const { f, calls } = await setup()
  await f.after(edit())
  await f.after(shell("bun test", 0))
  await f.idle("s")
  expect(calls).toEqual([])
  expect(f.continued).toEqual([])
  expect(statuses().at(-1)).toMatchObject({ status: "verified", checks: [{ command: "bun test", ok: true, reused: true }] })
})

test("a pass before the last change does not count", async () => {
  const { f, calls } = await setup([{ code: 1, output: "1 fail" }])
  await f.after(shell("bun test", 0))
  await f.after(edit())
  await f.idle("s")
  expect(calls).toEqual(["bun test"])
  expect(f.continued).toHaveLength(1)
})

test("a pass under another package manager covers the detected check", async () => {
  const { f, calls } = await setup([], {}, ["npm run test"])
  await f.after(edit())
  await f.after(shell("bun run test", 0))
  await f.idle("s")
  expect(calls).toEqual([])
})
