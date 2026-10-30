import { expect, test } from "bun:test"
import type { ContextEvent } from "../src/host.ts"
import { DEFAULTS } from "../src/options.ts"
import { registerPrompt } from "../src/core/prompt/register.ts"
import { assemblePrompt } from "../src/core/prompt/select.ts"
import { selectTier, type TierId } from "../src/tiers/index.ts"
import { createFakeHost } from "./fake-host.ts"

const event = (agent = "build", system = [{ text: "OLD" }, { text: "ENV" }]): ContextEvent => ({
  sessionID: "s",
  agent,
  model: { providerID: "ollama", id: "q" },
  system,
  tools: { edit: {} },
})

test("replaces the base system part", async () => {
  const f = createFakeHost()
  const tiers = new Map<string, TierId>()
  await registerPrompt(f.host, DEFAULTS, tiers)
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toBe(assemblePrompt(["edit"], selectTier(e.model, DEFAULTS)))
  expect(e.system[1]!.text).toBe("ENV")
  expect(tiers.get("s")).toBe("small")
})

test("skips agents with a custom system prompt", async () => {
  const f = createFakeHost()
  f.customSystemAgents.add("title")
  await registerPrompt(f.host, DEFAULTS, new Map())
  const e = event("title")
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD")
})

test("no-op on empty system", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, DEFAULTS, new Map())
  const e = event("build", [])
  await f.context(e)
  expect(e.system).toEqual([])
})

test("disabled does nothing", async () => {
  const f = createFakeHost()
  await registerPrompt(f.host, { ...DEFAULTS, prompt: { enabled: false } }, new Map())
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toBe("OLD")
})
