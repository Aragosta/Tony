import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TONY_PLUGIN, withPlugin } from "../overlay/packages/desktop/src/main/tony/config.ts"

const recommended = JSON.parse(readFileSync(join(import.meta.dir, "../../../config/opencode.json"), "utf8"))

test("the shipped config loads Tony from the app's resources and keeps the recommended defaults", () => {
  const dir = "C:\\Program Files\\Tony\\resources\\tony\\plugin"
  const config = withPlugin(recommended, dir)
  expect(config.plugins[0]).toEqual({ ...recommended.plugins[0], package: dir })
  expect(config.experimental).toEqual(recommended.experimental)
  expect(config.agents).toEqual(recommended.agents)
  expect(JSON.stringify(config)).not.toContain(TONY_PLUGIN)
  expect(recommended.plugins[0].package).toBe(TONY_PLUGIN)
})

test("a config without the Tony placeholder is refused, so the app never starts without its brain", () => {
  expect(() => withPlugin({ plugins: [] }, "/x")).toThrow("Tony")
})

test("the user's Tony options (tony.json) are merged into the bundled defaults, one level deep", () => {
  const config = { plugins: [{ package: TONY_PLUGIN, options: { gate: { maxRounds: 3 }, prompt: { enabled: true } } }] }
  const merged = withPlugin(config, "/x", { gate: { checkTimeoutMs: 1000 }, loopGuard: { blockAt: 4 } })
  expect(merged.plugins[0]!.options as Record<string, unknown>).toEqual({ gate: { maxRounds: 3, checkTimeoutMs: 1000 }, prompt: { enabled: true }, loopGuard: { blockAt: 4 } })
  expect(withPlugin(config, "/x").plugins[0]!.options).toEqual(config.plugins[0]!.options)
})
