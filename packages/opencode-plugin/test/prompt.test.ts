import { expect, test } from "bun:test"
import type { ContextEvent } from "../src/host.ts"
import { DEFAULTS } from "../src/options.ts"
import { registerPrompt } from "../src/core/prompt/register.ts"
import { promptAddition } from "../src/core/prompt/text.ts"
import { createFakeHost } from "./fake-host.ts"

const event = (agent = "build", system = [{ text: "OLD" }, { text: "ENV" }]): ContextEvent => ({
  sessionID: "s",
  agent,
  model: { providerID: "llamacpp", id: "q" },
  system,
  tools: { edit: {} },
})

test("appends to the base part", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, DEFAULTS, () => [])
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD\n\n" + promptAddition([]))
  expect(e.system[1]!.text).toBe("ENV")
})

test("names detected checks", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, DEFAULTS, () => ["bun run test"])
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toContain("run the project's checks once (`bun run test`).")
})

test("identical across requests, detected once", async () => {
  const f = createFakeHost()
  f.sessions.set("s", { directory: "/proj" })
  const seen: string[] = []
  await registerPrompt(f.host, DEFAULTS, (dir) => (seen.push(dir), ["npm run test"]))
  const texts: string[] = []
  for (let i = 0; i < 2; i++) {
    const e = event()
    await f.context(e)
    texts.push(e.system[0]!.text)
  }
  expect(texts[0]).toBe(texts[1]!)
  expect(seen).toEqual(["/proj"])
})

test("configured gate checks win over detection", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, { ...DEFAULTS, gate: { ...DEFAULTS.gate, checks: ["make check"] } }, () => ["npm run test"])
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toContain("`make check`")
  expect(e.system[0]!.text).not.toContain("npm run test")
})

test("skips agents with a custom system prompt", async () => {
  const f = createFakeHost()
  f.customSystemAgents.add("title")
  await registerPrompt(f.host, DEFAULTS)
  const e = event("title")
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD")
})

test("no-op on empty system", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, DEFAULTS)
  const e = event("build", [])
  await f.context(e)
  expect(e.system).toEqual([])
})

test("disabled does nothing", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, { ...DEFAULTS, prompt: { enabled: false } })
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD")
})

test("at most 150 words", () => {
  expect(promptAddition(["npm run typecheck", "npm run lint", "npm run test"]).split(/\s+/).length).toBeLessThanOrEqual(150)
})
