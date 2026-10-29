import { expect, test } from "bun:test"
import { createFakeHost } from "./fake-host.ts"

test("append is supplied", async () => {
  const f = createFakeHost()
  await f.host.onToolAfter((e) => {
    if (e.status === "completed") e.append("X")
  })
  await f.after({ tool: "read", sessionID: "s", input: {}, status: "completed", result: {} })
  expect(f.appended).toEqual(["X"])
})

test("idle runs callbacks", async () => {
  const f = createFakeHost()
  const seen: string[] = []
  await f.host.onIdle((e) => {
    seen.push(e.sessionID)
  })
  await f.idle("s")
  expect(seen).toEqual(["s"])
})

test("continueWith records", async () => {
  const f = createFakeHost()
  await f.host.continueWith("s", "T", "D")
  expect(f.continued).toEqual([{ sessionID: "s", text: "T", description: "D" }])
})
