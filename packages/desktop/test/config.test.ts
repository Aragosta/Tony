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
