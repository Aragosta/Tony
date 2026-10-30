import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The Tony app, its brain and the tests must all use one opencode version; an update bumps them together.
const root = join(import.meta.dir, "../../..")
const read = (path: string) => readFileSync(join(root, path), "utf8")
const version = read("desktop/opencode-version").trim()

test("desktop/opencode-version is a plain version", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+$/)
})

test("the plugin builds against the same opencode version the app ships", () => {
  const plugin = JSON.parse(read("packages/opencode-plugin/package.json"))
  expect(plugin.devDependencies["@opencode/plugin"]).toBe(version)
  expect(plugin.peerDependencies["@opencode/plugin"]).toBe(version)
})

test("CI tests against the same opencode version the app ships", () => {
  const installs = [...read(".github/workflows/ci.yml").matchAll(/@opencode\/cli@([\d.]+)/g)].map((m) => m[1])
  expect(installs.length).toBeGreaterThan(0)
  expect(new Set(installs)).toEqual(new Set([version]))
})
