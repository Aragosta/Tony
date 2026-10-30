import { expect, test } from "bun:test"
import { bumpPlugin } from "../src/bump.ts"

test("the plugin's dev and peer pins move to the new version", () => {
  const manifest = {
    name: "@aragosta/tony",
    peerDependencies: { "@opencode/plugin": "2.2.1" },
    devDependencies: { "@opencode/plugin": "2.2.1", typescript: "5.9.3" },
  }
  const bumped = bumpPlugin(manifest, "2.3.0")
  expect(bumped.peerDependencies["@opencode/plugin"]).toBe("2.3.0")
  expect(bumped.devDependencies).toEqual({ "@opencode/plugin": "2.3.0", typescript: "5.9.3" })
  expect(manifest.devDependencies["@opencode/plugin"]).toBe("2.2.1")
})

test("a version that isn't plain x.y.z is refused", () => {
  expect(() => bumpPlugin({}, "2.3.0-beta.1; rm -rf /")).toThrow("version")
})
