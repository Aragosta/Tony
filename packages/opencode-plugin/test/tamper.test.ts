import { expect, test } from "bun:test"
import { fallbackFindings, isTestFile, patchFiles, tamperFindings } from "../src/core/gate/tamper.ts"

test("detects test files", () => {
  expect(isTestFile("src/a.test.ts")).toBe(true)
  expect(isTestFile("tests/x.py")).toBe(true)
  expect(isTestFile("pkg/a_test.go")).toBe(true)
  expect(isTestFile("src/testing.ts")).toBe(false)
})

test("removed cases and assertions", () => {
  const before = 'test("a",()=>{expect(1).toBe(1)})\ntest("b",()=>{expect(2).toBe(2)})'
  const after = 'test("a",()=>{expect(1).toBe(1)})'
  const f = tamperFindings("t.test.ts", before, after)
  expect(f.join("\n")).toContain("1 test case(s) removed")
  expect(f.join("\n")).toContain("1 assertion(s) removed")
})

test("skip marker", () => {
  const before = 'test("a",()=>{expect(1).toBe(1)})'
  const after = 'test.skip("a",()=>{expect(1).toBe(1)})'
  expect(tamperFindings("t.test.ts", before, after).join("\n")).toContain("skip or only marker added")
})

test("stub added", () => {
  const before = 'test("a",async()=>{expect(await fetchStatus()).toBe("ok")})'
  const after =
    'test("a",async()=>{process.env.STATUS_URL = "http://localhost:1"\nglobalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("ok") })\nexpect(await fetchStatus()).toBe("ok")})'
  expect(tamperFindings("t.test.ts", before, after)).toEqual(["t.test.ts: 2 mock(s) or stub(s) added"])
})

test("stubs count across languages", () => {
  for (const line of ["vi.mock('./a')", "jest.spyOn(a, 'b')", "mock.module('./a', () => ({}))", "monkeypatch.setattr(a, 'b', c)", "@patch('a.b')", "sinon.stub(a, 'b')", "window.fetch = f"]) {
    expect([line, tamperFindings("t.test.ts", "", line).length]).toEqual([line, 1])
  }
})

test("defaults added for missing settings", () => {
  const before = "const url = process.env.STATUS_URL"
  for (const after of [
    'const url = process.env.STATUS_URL ?? "http://localhost:1"',
    "const url = process.env.STATUS_URL || 'http://localhost:1'",
    'const url = process.env["STATUS_URL"] ?? `http://x`',
  ]) {
    expect(fallbackFindings("src/api.ts", before, after)).toEqual(["src/api.ts: default added for missing setting STATUS_URL"])
  }
  expect(fallbackFindings("app.py", "", 'url = os.environ.get("STATUS_URL", "http://x")\nkey = os.getenv("KEY", "k")')).toEqual([
    "app.py: default added for missing setting STATUS_URL",
    "app.py: default added for missing setting KEY",
  ])
})

test("existing defaults and plain reads are not findings", () => {
  const code = 'const port = process.env.PORT ?? "3000"'
  expect(fallbackFindings("src/a.ts", code, code + "\nconst x = 1")).toEqual([])
  expect(fallbackFindings("src/a.ts", "", "const url = process.env.STATUS_URL\nconst n = process.env.N ?? fail()")).toEqual([])
  expect(fallbackFindings("src/new.ts", null, 'const u = process.env.U ?? "x"')).toEqual(["src/new.ts: default added for missing setting U"])
})

test("removed error checks in source", () => {
  const before = 'export async function fetchStatus() {\n  const url = process.env.STATUS_URL\n  if (!url) throw new Error("STATUS_URL is not set")\n  return (await fetch(url)).text()\n}'
  const faked = before.replace('throw new Error("STATUS_URL is not set")', 'return "ok"')
  expect(fallbackFindings("src/status.ts", before, faked)).toEqual(["src/status.ts: 1 error check(s) removed"])
  expect(fallbackFindings("x.py", "if not k:\n    raise KeyError(k)", "if not k:\n    return None")).toEqual(["x.py: 1 error check(s) removed"])
})

test("added or moved error checks are not findings", () => {
  const stub = 'export function parseDuration(s: string): number {\n  throw new Error("not implemented")\n}'
  const impl = 'export function parseDuration(s: string): number {\n  if (!s) throw new Error(`bad: ${s}`)\n  if (s.startsWith("-")) throw new Error(`bad: ${s}`)\n  return Number(s)\n}'
  expect(fallbackFindings("src/duration.ts", stub, impl)).toEqual([])
  expect(fallbackFindings("src/a.ts", "a()\nthrow e", "throw e\na()")).toEqual([])
  expect(fallbackFindings("src/new.ts", null, "const x = 1")).toEqual([])
})

test("new and deleted files", () => {
  expect(tamperFindings("t.test.ts", null, "x")).toEqual([])
  expect(tamperFindings("t.test.ts", "x", null)).toEqual(["t.test.ts: deleted"])
})

test("parses patch headers", () => {
  const patch = "*** Begin Patch\n*** Add File: a.ts\n+x\n*** Update File: b.ts\n@@\n*** Delete File: c.ts\n*** End Patch"
  expect(patchFiles(patch)).toEqual([
    { kind: "add", path: "a.ts" },
    { kind: "update", path: "b.ts" },
    { kind: "delete", path: "c.ts" },
  ])
})
