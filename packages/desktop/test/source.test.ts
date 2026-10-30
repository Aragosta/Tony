import { expect, test } from "bun:test"
import { narrowRoot, workspaceClosure } from "../src/source.ts"

const manifests = {
  "@opencode/desktop": { dir: "packages/desktop", manifest: { devDependencies: { "@opencode/app": "workspace:*", electron: "44.9.1" } } },
  "@opencode/app": { dir: "packages/app", manifest: { dependencies: { "@opencode/ui": "workspace:*" } } },
  "@opencode/ui": { dir: "packages/ui", manifest: { peerDependencies: { "@opencode/util": "workspace:^" } } },
  "@opencode/util": { dir: "packages/util", manifest: {} },
  "@opencode/script": { dir: "packages/script", manifest: {} },
  "@opencode/console": { dir: "packages/console/app", manifest: { dependencies: { "@opencode/ui": "workspace:*" } } },
}

test("the closure follows workspace dependencies of every kind and nothing else", () => {
  expect(workspaceClosure(manifests, ["@opencode/desktop"])).toEqual(["packages/app", "packages/desktop", "packages/ui", "packages/util"])
})

test("the closure fails loudly on a workspace dependency it cannot find", () => {
  expect(() => workspaceClosure({ a: { dir: "packages/a", manifest: { dependencies: { b: "workspace:*" } } } }, ["a"])).toThrow(
    "workspace package b",
  )
})

test("the root manifest keeps catalog, patches and overrides, lists only the needed workspaces, and runs no hooks", () => {
  const root = {
    name: "opencode",
    scripts: { postinstall: "bun run --cwd packages/core fix-node-pty", prepare: "husky", dev: "x" },
    workspaces: { packages: ["packages/*", "services/*"], catalog: { effect: "4.0.1" } },
    dependencies: { "@opencode/script": "workspace:*", typescript: "catalog:" },
    patchedDependencies: { "vite@8.2.4": "patches/vite.patch" },
  }
  const narrowed = narrowRoot(root, manifests, ["@opencode/desktop"])
  expect(narrowed.workspaces).toEqual({
    packages: ["packages/app", "packages/desktop", "packages/script", "packages/ui", "packages/util"],
    catalog: { effect: "4.0.1" },
  })
  expect(narrowed.scripts).toEqual({ dev: "x" })
  expect(narrowed.patchedDependencies).toEqual(root.patchedDependencies)
  expect(root.workspaces.packages).toEqual(["packages/*", "services/*"])
})
