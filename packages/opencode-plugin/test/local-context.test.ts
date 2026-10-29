import { expect, test } from "bun:test"
import { planContextCaps, registerLocalContext } from "../src/local/context.ts"
import { DEFAULTS } from "../src/options.ts"
import { createFakeHost } from "./fake-host.ts"

const local = DEFAULTS.local

test("caps local models above the limit", () => {
  expect(planContextCaps([{ providerID: "ollama", id: "q", context: 262144 }], local)).toEqual([
    { providerID: "ollama", id: "q", context: 131072 },
  ])
})

test("fills in unknown context", () => {
  expect(planContextCaps([{ providerID: "llamacpp", id: "m", context: undefined }], local)).toEqual([
    { providerID: "llamacpp", id: "m", context: 131072 },
  ])
})

test("leaves smaller local windows alone", () => {
  expect(planContextCaps([{ providerID: "ollama", id: "s", context: 65536 }], local)).toEqual([])
})

test("ignores cloud models", () => {
  expect(planContextCaps([{ providerID: "anthropic", id: "x", context: 1000000 }], local)).toEqual([])
})

test("registerLocalContext wires the plan", async () => {
  const f = createFakeHost()
  await registerLocalContext(f.host, local)
  expect(f.models([{ providerID: "ollama", id: "q", context: 262144 }])).toEqual([
    { providerID: "ollama", id: "q", context: 131072 },
  ])
})
