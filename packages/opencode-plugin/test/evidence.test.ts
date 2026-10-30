import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ToolAfterEvent } from "../src/host.ts"
import { EvidenceTracker, runsCheck } from "../src/core/gate/evidence.ts"
import { normalizeCheck } from "../src/core/verify/detect.ts"

const setup = () => ({ t: new EvidenceTracker(), dir: mkdtempSync(join(tmpdir(), "tony-ev-")) })
const done = (tool: string, input: unknown, extra: Partial<{ content: string; metadata: Record<string, unknown> }> = {}): ToolAfterEvent => ({
  tool,
  sessionID: "s",
  input,
  status: "completed",
  result: { content: extra.content, metadata: extra.metadata },
  append() {},
})
const failed = (tool: string, input: unknown, message: string): ToolAfterEvent => ({ tool, sessionID: "s", input, status: "error", error: { message } })

test("tracks changed files", async () => {
  const { t, dir } = setup()
  t.after(done("edit", { path: "a.ts" }), dir)
  t.after(done("write", { path: join(dir, "b.ts") }), dir)
  const e = await t.evidence("s", dir)
  expect(e.changedFiles).toEqual(["a.ts", "b.ts"])
  expect(e.changeSeq).toBe(2)
})

test("test check failure counts", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "bun test" }, { content: "1 fail", metadata: { exit: 1 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure?.summary.startsWith("`bun test` exited with code 1")).toBe(true)
})

test("exploratory shell failures are ignored", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "grep foo x" }, { metadata: { exit: 1 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure).toBeUndefined()
})

test("own refusals are ignored", async () => {
  const { t, dir } = setup()
  t.after(failed("shell", { command: "x" }, "Blocked: you already called"), dir)
  expect((await t.evidence("s", dir)).lastFailure).toBeUndefined()
})

test("mutation clears failure", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "bun test" }, { metadata: { exit: 1 } }), dir)
  t.after(done("edit", { path: "a.ts" }), dir)
  expect((await t.evidence("s", dir)).lastFailure).toBeUndefined()
})

test("same call succeeding clears failure", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "bun test" }, { metadata: { exit: 1 } }), dir)
  t.after(done("shell", { command: "bun test" }, { metadata: { exit: 0 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure).toBeUndefined()
})

test("a later passing check clears a different check's failure", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "npx tsx test/money.test.ts" }, { metadata: { exit: 1 } }), dir)
  t.after(done("shell", { command: "npm run test" }, { metadata: { exit: 0 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure).toBeUndefined()
})

test("a passing check does not clear a failed tool call", async () => {
  const { t, dir } = setup()
  t.after(failed("edit", { path: "a.ts" }, "oldString not found"), dir)
  t.after(done("shell", { command: "bun test" }, { metadata: { exit: 0 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure?.tool).toBe("edit")
})

test("open todos", async () => {
  const { t, dir } = setup()
  t.after(done("todowrite", { todos: [{ content: "a", status: "completed" }, { content: "b", status: "pending" }] }), dir)
  expect((await t.evidence("s", dir)).openTodos).toEqual(["b"])
})

test("restored test clears the finding", async () => {
  const { t, dir } = setup()
  const original = 'test("a",()=>{expect(1).toBe(1)})\ntest("b",()=>{expect(2).toBe(2)})'
  writeFileSync(join(dir, "x.test.ts"), original)
  const e = { tool: "edit", sessionID: "s", input: { path: "x.test.ts" } }
  await t.before(e, dir)
  writeFileSync(join(dir, "x.test.ts"), 'test("a",()=>{expect(1).toBe(1)})')
  t.after(done("edit", { path: "x.test.ts" }), dir)
  expect((await t.evidence("s", dir)).testTampering.length).toBeGreaterThan(0)
  writeFileSync(join(dir, "x.test.ts"), original)
  expect((await t.evidence("s", dir)).testTampering).toEqual([])
})

test("snapshot files count as changes", async () => {
  const { t, dir } = setup()
  t.addSnapshotFiles("s", ["c.ts"])
  const e = await t.evidence("s", dir)
  expect(e.changedFiles).toContain("c.ts")
  expect(e.changeSeq).toBe(1)
  t.addSnapshotFiles("s", ["c.ts"])
  expect((await t.evidence("s", dir)).changeSeq).toBe(1)
})

test("beginTurn resets", async () => {
  const { t, dir } = setup()
  t.after(done("edit", { path: "a.ts" }), dir)
  t.beginTurn("s")
  const e = await t.evidence("s", dir)
  expect(e).toEqual({ changedFiles: [], changeSeq: 0, openTodos: [], testTampering: [], passedChecks: [], refusedEdits: [], fallbacks: [] })
})

test("shell-changed test files are compared with git HEAD", async () => {
  const { t, dir } = setup()
  const { execSync } = await import("node:child_process")
  writeFileSync(join(dir, "y.test.ts"), 'test("a",()=>{})\ntest("b",()=>{})')
  execSync("git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -qm i", { cwd: dir })
  writeFileSync(join(dir, "y.test.ts"), 'test("a",()=>{})')
  t.addSnapshotFiles("s", ["y.test.ts"])
  expect((await t.evidence("s", dir)).testTampering).toEqual(["y.test.ts: 1 test case(s) removed"])
})

test("exploratory commands don't count, even with check words in them", async () => {
  for (const command of ["test -f src/a.ts", "grep -rn test src", "ls tests", "grep -q build package.json", "cat README.md | grep -i 'go '", "git checkout nope", "[ -f x ] && echo make", "find . -name '*.test.ts'"]) {
    const { t, dir } = setup()
    t.after(done("shell", { command }, { metadata: { exit: 1 } }), dir)
    expect([command, (await t.evidence("s", dir)).lastFailure]).toEqual([command, undefined])
  }
})

test("check commands count", async () => {
  for (const command of ["npm run build", "cd pkg && pnpm test", "CI=1 npx vitest run", "cargo test", "go test ./...", "python -m pytest -q", "tsc --noEmit", "make", "bun run lint 2>&1 | tail -5"]) {
    const { t, dir } = setup()
    t.after(done("shell", { command }, { metadata: { exit: 1 } }), dir)
    expect([command, (await t.evidence("s", dir)).lastFailure?.tool]).toEqual([command, "shell"])
  }
})

test("lookup tool errors are exploration", async () => {
  const { t, dir } = setup()
  t.after(failed("read", { path: "missing.ts" }, "File not found: missing.ts"), dir)
  t.after(failed("glob", { pattern: "*.x" }, "No files found"), dir)
  expect((await t.evidence("s", dir)).lastFailure).toBeUndefined()
})

// opencode fires no after-hook for a refused call; the guard reports it directly.
const refuse = (t: EvidenceTracker, dir: string, path: string) =>
  t.refused({ tool: "write", sessionID: "s", input: { path } }, `Edit refused: read ${path} before editing it`, dir)

test("a refused edit stays open until that file is changed", async () => {
  const { t, dir } = setup()
  refuse(t, dir, "test/a.test.ts")
  expect((await t.evidence("s", dir)).refusedEdits).toEqual([{ path: "test/a.test.ts", message: "Edit refused: read test/a.test.ts before editing it" }])
  // An edit to another file does not resolve it.
  t.after(done("write", { path: "src/a.ts" }), dir)
  expect((await t.evidence("s", dir)).refusedEdits).toHaveLength(1)
  t.after(done("write", { path: join(dir, "test/a.test.ts") }), dir)
  expect((await t.evidence("s", dir)).refusedEdits).toEqual([])
})

const pass = (command: string, extra: Record<string, unknown> = {}) => done("shell", { command, ...extra }, { metadata: { exit: 0 } })

test("a passing check is recorded when it is the latest action", async () => {
  const { t, dir } = setup()
  t.after(pass("bun test"), dir)
  t.after(done("edit", { path: "a.ts" }), dir)
  expect((await t.evidence("s", dir)).passedChecks).toEqual([])
  t.after(pass("bun  test"), dir)
  // Lookups don't change files.
  t.after(done("read", { path: "a.ts" }), dir)
  t.after(done("grep", { pattern: "x" }), dir)
  expect((await t.evidence("s", dir)).passedChecks).toEqual(["bun test"])
  t.addSnapshotFiles("s", ["b.ts"])
  expect((await t.evidence("s", dir)).passedChecks).toEqual([])
})

test("any later shell command drops the pass", async () => {
  const { t, dir } = setup()
  t.after(pass("bun test"), dir)
  t.after(pass("printf 'broken' > src/a.ts"), dir)
  expect((await t.evidence("s", dir)).passedChecks).toEqual([])
  t.after(pass("bun test"), dir)
  t.after(done("shell", { command: "bun run lint" }, { metadata: { exit: 1 } }), dir)
  expect((await t.evidence("s", dir)).passedChecks).toEqual([])
  t.after(pass("bun test"), dir)
  t.after(done("subagent", { prompt: "fix it" }), dir)
  expect((await t.evidence("s", dir)).passedChecks).toEqual([])
})

test("passes elsewhere, in the background or in compound commands don't count", async () => {
  const { t, dir } = setup()
  for (const call of [
    pass("bun test", { workdir: "sub" }),
    pass("bun test", { background: true }),
    pass("cd sub && bun test"),
    pass("bun test 2>&1 | tail -5"),
    pass("bun test > out.txt"),
    pass("bun test; true"),
  ]) {
    t.after(call, dir)
    expect((await t.evidence("s", dir)).passedChecks).toEqual([])
  }
  t.after(pass("bun test", { workdir: dir }), dir)
  expect((await t.evidence("s", dir)).passedChecks).toEqual(["bun test"])
})

test("check commands normalize", () => {
  expect(normalizeCheck("npm test")).toBe("run test")
  expect(normalizeCheck("  pnpm   run  lint ")).toBe("run lint")
  expect(normalizeCheck("bun run test")).toBe("run test")
  // bun's own test runner, not the "test" script.
  expect(normalizeCheck("bun test")).toBe("bun test")
  expect(normalizeCheck("cargo test --quiet")).toBe("cargo test --quiet")
})

test("failure key is the call, not its output", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "bun test" }, { content: "run 1", metadata: { exit: 1 } }), dir)
  const k1 = (await t.evidence("s", dir)).lastFailure?.key
  expect(k1).toBeDefined()
  t.after(done("shell", { command: "bun test" }, { content: "run 2", metadata: { exit: 1 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure?.key).toBe(k1!)
})

test("Windows-style paths are compared with forward slashes", async () => {
  const { t, dir } = setup()
  t.addSnapshotFiles("s", ["test\\a.test.ts"])
  expect((await t.evidence("s", dir)).changedFiles).toEqual(["test/a.test.ts"])
})

test("Windows runner names count as checks", () => {
  expect(runsCheck("npm.cmd test")).toBe(true)
  expect(runsCheck("C:\\tools\\bun.exe test")).toBe(true)
  expect(runsCheck("grep.exe test x")).toBe(false)
})

test("a default added for a missing setting in source is a fallback", async () => {
  const { t, dir } = setup()
  writeFileSync(join(dir, "api.ts"), "const url = process.env.STATUS_URL\n")
  const e = { tool: "edit", sessionID: "s", input: { path: "api.ts" } }
  await t.before(e, dir)
  writeFileSync(join(dir, "api.ts"), 'const url = process.env.STATUS_URL ?? "http://localhost:1"\n')
  t.after(done("edit", { path: "api.ts" }), dir)
  expect((await t.evidence("s", dir)).fallbacks).toEqual(["api.ts: default added for missing setting STATUS_URL"])
})
