import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectChecks } from "../src/verify/detect.ts"
import { exec } from "../src/verify/exec.ts"

const dir = (files: Record<string, string> = {}) => {
  const d = mkdtempSync(join(tmpdir(), "tony-verify-"))
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith("/")) mkdirSync(join(d, name), { recursive: true })
    else writeFileSync(join(d, name), content)
  }
  return d
}

test("exec captures output and code", async () => {
  const r = await exec("echo hi; exit 3", dir(), 5000)
  expect(r.code).toBe(3)
  expect(r.timedOut).toBe(false)
  expect(r.output).toContain("hi")
})

test("exec times out", async () => {
  const start = Date.now()
  const r = await exec("sleep 5", dir(), 300)
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
