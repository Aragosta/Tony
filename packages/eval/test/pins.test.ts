import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The Tony app, its brain and the tests must all use one opencode version; an update bumps them together.
const root = join(import.meta.dir, "../../..")
const read = (path: string) => readFileSync(join(root, path), "utf8")
const version = read("packages/desktop/opencode-version").trim()

test("packages/desktop/opencode-version is a plain version", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+$/)
})

test("the plugin builds against the same opencode version the app ships", () => {
  const plugin = JSON.parse(read("packages/opencode-plugin/package.json"))
  expect(plugin.devDependencies["@opencode/plugin"]).toBe(version)
  expect(plugin.peerDependencies["@opencode/plugin"]).toBe(version)
})

test("CI installs the opencode version the app ships, not a version of its own", () => {
  expect(read(".github/workflows/ci.yml")).not.toMatch(/@opencode\/cli@\d/)
})
