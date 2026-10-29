import { expect, test } from "bun:test"
import { join } from "node:path"
import { configFile, mergeTonyConfig, parseJsonc, providerBlock } from "../src/config.ts"

const recommended = {
  $schema: "https://opencode.ai/config.json",
  plugins: [{ package: "@aragosta/tony@1.0.0", options: {} }],
  experimental: { todo: true, background_compaction: true },
  agents: { build: { steps: 150 }, explore: { steps: 40, permissions: [{ action: "shell", resource: "*", effect: "deny" }] } },
}
const TONY = "/Users/me/Tony/packages/opencode-plugin"

test("an empty config gets Tony and the recommended defaults", () => {
  expect(mergeTonyConfig({}, recommended, TONY)).toEqual({ ...recommended, plugins: [{ package: TONY, options: {} }] })
})

test("your own settings, plugins and agent fields are kept", () => {
  const existing = {
    model: "ollama/qwen",
    plugins: [{ package: "other-plugin" }],
    experimental: { todo: false },
    agents: { build: { steps: 20, model: "x/y" } },
  }
  const merged = mergeTonyConfig(existing, recommended, TONY)
  expect(merged.model).toBe("ollama/qwen")
  expect(merged.plugins).toEqual([{ package: TONY, options: {} }, { package: "other-plugin" }])
  expect(merged.experimental).toEqual({ todo: false, background_compaction: true })
  expect(merged.agents.build).toEqual({ steps: 20, model: "x/y" })
  expect(merged.agents.explore).toEqual(recommended.agents.explore)
})

test("an older Tony entry is replaced and keeps its options", () => {
  for (const old of ["@aragosta/tony@0.9.0", "/old/place/packages/opencode-plugin", "C:\\Tony\\packages\\opencode-plugin", "{env:TONY_HOME}/packages/opencode-plugin"]) {
    const merged = mergeTonyConfig({ plugins: [{ package: old, options: { gate: { maxRounds: 2 } } }] }, recommended, TONY)
    expect(merged.plugins).toEqual([{ package: TONY, options: { gate: { maxRounds: 2 } } }])
  }
})

test("JSONC comments and trailing commas parse", () => {
  const text = `{
    // my model
    "model": "a/b", /* block */
    "url": "http://x//y",
    "plugins": [ { "package": "p" }, ],
  }`
  expect(parseJsonc(text)).toEqual({ model: "a/b", url: "http://x//y", plugins: [{ package: "p" }] })
})

test("config file follows OPENCODE_CONFIG_DIR, XDG_CONFIG_HOME, then ~/.config", () => {
  expect(configFile({ OPENCODE_CONFIG_DIR: "/c" }, "/home/me", () => false)).toBe(join("/c", "opencode.json"))
  expect(configFile({ XDG_CONFIG_HOME: "/x" }, "/home/me", () => false)).toBe(join("/x", "opencode", "opencode.json"))
  expect(configFile({}, "/home/me", () => false)).toBe(join("/home/me", ".config", "opencode", "opencode.json"))
  // An existing opencode.jsonc is the file opencode reads.
  expect(configFile({}, "/home/me", (p) => p.endsWith(".jsonc"))).toBe(join("/home/me", ".config", "opencode", "opencode.jsonc"))
})

test("provider blocks for llama.cpp and an Ollama model", () => {
  expect(providerBlock("llamacpp", { llamacpp: { name: "llama.cpp" } })).toEqual({ id: "llamacpp/local", providers: { llamacpp: { name: "llama.cpp" } } })
  const o = providerBlock("ollama:qwen3-coder:30b", {})
  expect(o.id).toBe("ollama/qwen3-coder:30b")
  expect(o.providers.ollama).toMatchObject({
    package: "@opencode/ai/providers/openai-compatible",
    settings: { baseURL: "http://127.0.0.1:11434/v1" },
    models: { "qwen3-coder:30b": { capabilities: { tools: true }, limit: { context: 131072 } } },
  })
  expect(() => providerBlock("ollama", {})).toThrow("ollama:<model>")
})
