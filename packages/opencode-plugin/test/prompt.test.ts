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
  await registerPrompt(f.host, DEFAULTS, tiers, () => [])
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

test("names the project's checks, detected once per session", async () => {
  const f = createFakeHost()
  f.sessions.set("s", { directory: "/proj" })
  const seen: string[] = []
  await registerPrompt(f.host, DEFAULTS, new Map(), (dir) => (seen.push(dir), ["npm run test"]))
  for (let i = 0; i < 2; i++) {
    const e = event()
    await f.context(e)
    expect(e.system[0]!.text).toContain("# This project\n- Checks: `npm run test`.")
  }
  expect(seen).toEqual(["/proj"])
})

test("configured gate checks win over detection; none means no section", async () => {
  const f = createFakeHost()
  f.sessions.set("s", { directory: "/proj" })
  await registerPrompt(f.host, { ...DEFAULTS, gate: { ...DEFAULTS.gate, checks: ["make check"] } }, new Map(), () => ["npm run test"])
  const e = event()
  await f.context(e)
  expect(e.system[0]!.text).toContain("`make check`")
  expect(e.system[0]!.text).not.toContain("npm run test")

  const g = createFakeHost()
  g.sessions.set("s", { directory: "/proj" })
  await registerPrompt(g.host, DEFAULTS, new Map(), () => [])
  const e2 = event()
  await g.context(e2)
  expect(e2.system[0]!.text).not.toContain("# This project")
})
