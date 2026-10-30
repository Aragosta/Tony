import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { changedMessage, notReadMessage, registerEditGuard } from "../src/core/edit/guard.ts"
import { createFakeHost } from "./fake-host.ts"

async function setup(enabled = true) {
  const f = createFakeHost()
  const dir = mkdtempSync(join(tmpdir(), "tony-eg-"))
  f.sessions.set("s", { directory: dir })
  writeFileSync(join(dir, "a.ts"), "one")
  await registerEditGuard(f.host, { enabled })
  return { f, dir }
}
const call = (tool: string, input: unknown) => ({ tool, sessionID: "s", input })
const completed = (tool: string, input: unknown) => ({ ...call(tool, input), status: "completed" as const, result: {} })
async function rejection(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return (e as Error).message
  }
  return undefined
}

test("refuses edits to unread files", async () => {
  const { f } = await setup()
  expect(await rejection(f.before(call("edit", { path: "a.ts" })))).toBe(notReadMessage("a.ts"))
})

test("allows after read", async () => {
  const { f } = await setup()
  await f.after(completed("read", { path: "a.ts" }))
  expect(await rejection(f.before(call("edit", { path: "a.ts" })))).toBeUndefined()
})

test("refuses stale files", async () => {
  const { f, dir } = await setup()
  await f.after(completed("read", { path: "a.ts" }))
  writeFileSync(join(dir, "a.ts"), "changed by someone")
  expect(await rejection(f.before(call("edit", { path: "a.ts" })))).toBe(changedMessage("a.ts"))
})

test("own edits keep it fresh", async () => {
  const { f, dir } = await setup()
  await f.after(completed("read", { path: "a.ts" }))
  await f.before(call("edit", { path: "a.ts" }))
  writeFileSync(join(dir, "a.ts"), "two")
  await f.after(completed("edit", { path: "a.ts" }))
  expect(await rejection(f.before(call("edit", { path: "a.ts" })))).toBeUndefined()
})

test("new files can be written without a read", async () => {
  const { f } = await setup()
  expect(await rejection(f.before(call("write", { path: "new.ts", content: "x" })))).toBeUndefined()
})

test("patch updates need a read", async () => {
  const { f } = await setup()
  expect(await rejection(f.before(call("patch", { patchText: "*** Update File: a.ts\n" })))).toBe(notReadMessage("a.ts"))
  expect(await rejection(f.before(call("patch", { patchText: "*** Add File: n.ts\n+x" })))).toBeUndefined()
})

test("disabled does nothing", async () => {
  const { f } = await setup(false)
  expect(await rejection(f.before(call("edit", { path: "a.ts" })))).toBeUndefined()
})
