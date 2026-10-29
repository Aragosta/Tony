import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkAliases, detectChecks } from "../src/verify/detect.ts"
import { exec } from "../src/verify/exec.ts"

const dir = (files: Record<string, string> = {}) => {
  const d = mkdtempSync(join(tmpdir(), "tony-verify-"))
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith("/")) mkdirSync(join(d, name), { recursive: true })
    else writeFileSync(join(d, name), content)
  }
  return d
}

const win = process.platform === "win32"

test("exec captures output and code", async () => {
  const r = await exec(win ? "echo hi & exit 3" : "echo hi; exit 3", dir(), 5000)
  expect(r.code).toBe(3)
  expect(r.timedOut).toBe(false)
  expect(r.output).toContain("hi")
})

test("exec times out", async () => {
  const start = Date.now()
  const r = await exec(win ? "ping -n 6 127.0.0.1 > nul" : "sleep 5", dir(), 300)
  expect(r.timedOut).toBe(true)
  expect(Date.now() - start).toBeLessThan(2000)
})

test("bun scripts in order", () => {
  const d = dir({ "package.json": JSON.stringify({ scripts: { test: "bun test", lint: "x", typecheck: "tsc" } }), "bun.lock": "" })
  expect(detectChecks(d)).toEqual(["bun run typecheck", "bun run lint", "bun run test"])
})

test("npm default test script is skipped", () => {
  const d = dir({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) })
  expect(detectChecks(d)).toEqual([])
})

test("go module", () => {
  expect(detectChecks(dir({ "go.mod": "module x" }))).toEqual(["go build ./... && go test ./..."])
})

test("python with tests dir", () => {
  expect(detectChecks(dir({ "pyproject.toml": "", "tests/": "" }))).toEqual(["python -m pytest -q"])
})

test("nothing detected", () => {
  expect(detectChecks(dir())).toEqual([])
})

test("checks get no stdin and run as CI", async () => {
  const r = await exec(win ? "echo CI=%CI%" : "cat; echo CI=$CI", dir(), 3000)
  expect(r.timedOut).toBe(false)
  expect(r.output).toContain("CI=1")
})

test("scripts that rewrite files or watch are not run", () => {
  const d = dir()
  writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { typecheck: "tsc", lint: "eslint --fix .", test: "vitest --watch" } }))
  expect(detectChecks(d)).toEqual(["npm run typecheck"])
})

test("a script check is also covered by running the script's body", () => {
  const dir = mkdtempSync(join(tmpdir(), "tony-alias-"))
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "bun  test", lint: "eslint ." } }))
  expect(checkAliases("npm run test", dir)).toEqual(["run test", "bun test"])
  expect(checkAliases("cargo test --quiet", dir)).toEqual(["cargo test --quiet"])
  expect(checkAliases("npm run missing", dir)).toEqual(["run missing"])
})
