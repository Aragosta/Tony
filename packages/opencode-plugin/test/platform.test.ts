import { expect, test } from "bun:test"
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { killCommand, onPath, shellQuote, spawnSpec, toPosix } from "../src/platform.ts"

test("paths use forward slashes", () => {
  expect(toPosix("test\\a.test.ts")).toBe("test/a.test.ts")
  expect(toPosix("src/a.ts")).toBe("src/a.ts")
})

test("quoting follows the shell", () => {
  expect(shellQuote("a b", "linux")).toBe("'a b'")
  expect(shellQuote("it's", "darwin")).toBe(`'it'\\''s'`)
  expect(shellQuote("a b", "win32")).toBe('"a b"')
  expect(shellQuote('say "hi"', "win32")).toBe('"say ""hi"""')
})

test("commands on PATH: executable bit on POSIX, PATHEXT on Windows", () => {
  const d = mkdtempSync(join(tmpdir(), "tony-path-"))
  writeFileSync(join(d, "ruff"), "")
  chmodSync(join(d, "ruff"), 0o755)
  writeFileSync(join(d, "go.EXE"), "")
  expect(onPath("ruff", { PATH: d }, "linux")).toBe(true)
  expect(onPath("go", { PATH: d }, "linux")).toBe(false)
  expect(onPath("go", { PATH: d, PATHEXT: ".COM;.EXE;.CMD" }, "win32")).toBe(true)
  expect(onPath("missing", { PATH: d, PATHEXT: ".EXE" }, "win32")).toBe(false)
})

test("POSIX runs bash in its own process group; Windows runs cmd without a window", () => {
  expect(spawnSpec("bun test", "darwin")).toEqual({ file: "bash", args: ["-lc", "bun test"], shell: false, detached: true })
  expect(spawnSpec("bun test", "win32")).toEqual({ file: "bun test", args: [], shell: true, detached: false })
})

test("timeouts kill the whole tree", () => {
  expect(killCommand(42, "linux")).toBeUndefined()
  expect(killCommand(42, "win32")).toEqual({ file: "taskkill", args: ["/pid", "42", "/T", "/F"] })
})
