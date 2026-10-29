import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ToolAfterEvent } from "../src/host.ts"
import { EvidenceTracker } from "../src/gate/evidence.ts"

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
  expect(e).toEqual({ changedFiles: [], changeSeq: 0, openTodos: [], testTampering: [] })
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

test("a refused edit that is never redone counts", async () => {
  const { t, dir } = setup()
  t.after(failed("write", { path: "test/a.test.ts" }, "Edit refused: read test/a.test.ts before editing it"), dir)
  expect((await t.evidence("s", dir)).lastFailure?.tool).toBe("write")
})

test("failure key is the call, not its output", async () => {
  const { t, dir } = setup()
  t.after(done("shell", { command: "bun test" }, { content: "run 1", metadata: { exit: 1 } }), dir)
  const k1 = (await t.evidence("s", dir)).lastFailure?.key
  expect(k1).toBeDefined()
  t.after(done("shell", { command: "bun test" }, { content: "run 2", metadata: { exit: 1 } }), dir)
  expect((await t.evidence("s", dir)).lastFailure?.key).toBe(k1!)
})
