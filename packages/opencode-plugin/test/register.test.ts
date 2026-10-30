import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ContextEvent, ToolBeforeEvent } from "../src/host.ts"
import { DEFAULTS } from "../src/options.ts"
import { registerTony } from "../src/register.ts"
import { createFakeHost } from "./fake-host.ts"

async function setup() {
  const f = createFakeHost()
  f.sessions.set("s", { directory: mkdtempSync(join(tmpdir(), "tony-reg-")) })
  f.transcripts.set("s", [
    { type: "user", text: "fix it" },
    { type: "assistant", text: "Fixed.", tools: [], files: [] },
  ])
  const calls: string[] = []
  await registerTony(f.host, DEFAULTS, {
    exec: async (command) => (calls.push(command), { code: 1, output: "1 fail", timedOut: false }),
    detect: () => ["bun test"],
  })
  return { f, calls }
}

test("every module is wired: prompt, local context, loop guard, gate", async () => {
  const { f, calls } = await setup()
  const e: ContextEvent = { sessionID: "s", agent: "build", model: { providerID: "llamacpp", id: "q" }, system: [{ text: "BASE" }], tools: {} }
  await f.context(e)
  expect(e.system[0]!.text).toStartWith("BASE\n\n# Tony")
  expect(f.models([{ providerID: "llamacpp", id: "q", context: 0 }])).toEqual([{ providerID: "llamacpp", id: "q", context: 131072 }])
  const read = { tool: "read", sessionID: "s", input: { path: "a.ts" } }
  const completed = (x: ToolBeforeEvent) => ({ ...x, status: "completed" as const, result: {} })
  await f.call(read, completed)
  await f.call(read, completed)
  expect(await f.call(read, completed)).toStartWith("Blocked:")
  await f.after({ tool: "edit", sessionID: "s", input: { path: "a.ts" }, status: "completed", result: {} })
  await f.idle("s")
  expect(calls).toEqual(["bun test"])
  expect(f.continued).toHaveLength(1)
})
