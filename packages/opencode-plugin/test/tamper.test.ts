import { expect, test } from "bun:test"
import { isTestFile, patchFiles, tamperFindings } from "../src/gate/tamper.ts"

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
