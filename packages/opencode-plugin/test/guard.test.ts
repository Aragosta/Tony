import { expect, test } from "bun:test"
import { registerLoopGuard, RESULT_EXCERPT_CHARS } from "../src/loop/guard.ts"
import { DEFAULTS } from "../src/options.ts"
import { createFakeHost } from "./fake-host.ts"

const call = { tool: "shell", sessionID: "s", input: { command: "git log -5" } }
const done = (content: string) => ({ ...call, status: "completed" as const, result: { content } })

async function setup(opts = DEFAULTS.loopGuard) {
  const fake = createFakeHost()
  await registerLoopGuard(fake.host, opts)
  return fake
}

async function message(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    return (e as Error).message
  }
  throw new Error("expected rejection")
}

test("blocks the third identical call with the previous result", async () => {
  const f = await setup()
  for (let i = 0; i < 2; i++) {
    await f.before(call)
    await f.after(done("RESULT-1"))
  }
  const msg = await message(f.before(call))
  expect(msg).toContain("identical input 2 times")
  expect(msg).toContain("RESULT-1")
})

test("stops at the fifth and interrupts", async () => {
  const f = await setup()
  for (let i = 0; i < 2; i++) await f.before(call)
  for (let i = 0; i < 2; i++) await message(f.before(call))
  expect(await message(f.before(call))).toContain("Stopped")
  await new Promise((r) => setTimeout(r, 5))
  expect(f.interrupts).toEqual(["s"])
})

test("stop resets the streak", async () => {
  const f = await setup()
  for (let i = 0; i < 2; i++) await f.before(call)
  for (let i = 0; i < 3; i++) await message(f.before(call))
  await f.before(call)
})

test("edits reset the streak", async () => {
  const f = await setup()
  const read = { tool: "read", sessionID: "s", input: { path: "a.ts" } }
  await f.before(read)
  await f.before(read)
  await f.after({ tool: "edit", sessionID: "s", input: {}, status: "completed", result: {} })
  await f.before(read)
})

test("exempt tools are never blocked", async () => {
  const f = await setup()
  for (let i = 0; i < 6; i++) await f.before({ tool: "todowrite", sessionID: "s", input: { todos: [] } })
})

test("disabled does nothing", async () => {
  const f = await setup({ ...DEFAULTS.loopGuard, enabled: false })
  for (let i = 0; i < 6; i++) await f.before(call)
})

test("long results are cut", async () => {
  const f = await setup()
  for (let i = 0; i < 2; i++) {
    await f.before(call)
    await f.after(done("x".repeat(5000)))
  }
  const msg = await message(f.before(call))
  const xs = msg.match(/x+/g)!.reduce((a, b) => (b.length > a.length ? b : a))
  expect(xs.length).toBeLessThanOrEqual(RESULT_EXCERPT_CHARS)
  expect(msg).toContain(xs + "…[truncated]")
})
