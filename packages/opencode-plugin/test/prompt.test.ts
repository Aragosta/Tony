import { expect, test } from "bun:test"
import type { ContextEvent } from "../src/host.ts"
import { DEFAULTS } from "../src/options.ts"
import { registerPrompt } from "../src/prompt/register.ts"
import { selectPrompt } from "../src/prompt/select.ts"
import { createFakeHost } from "./fake-host.ts"

const event = (agent = "build", system = [{ text: "OLD" }, { text: "ENV" }]): ContextEvent => ({
  agent,
  model: { providerID: "ollama", id: "q" },
  system,
  tools: { edit: {} },
})

test("replaces the base system part", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, DEFAULTS.prompt, DEFAULTS.local)
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toBe(selectPrompt(e.model, ["edit"], DEFAULTS.local))
  expect(e.system[1]!.text).toBe("ENV")
})

test("skips agents with a custom system prompt", async () => {
  const f = createFakeHost()
  f.customSystemAgents.add("title")
  await registerPrompt(f.host, DEFAULTS.prompt, DEFAULTS.local)
  const e = event("title")
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD")
})

test("no-op on empty system", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, DEFAULTS.prompt, DEFAULTS.local)
  const e = event("build", [])
  await f.context(e)
  expect(e.system).toEqual([])
})

test("disabled does nothing", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, { enabled: false }, DEFAULTS.local)
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD")
})
