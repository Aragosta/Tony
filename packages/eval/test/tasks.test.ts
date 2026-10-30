import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { runChecks } from "../src/run.ts"
import { loadTasks } from "../src/tasks.ts"
import { buildConfig, LANGFUSE_PACKAGE, loadVariants, pickVariants, prepareWorkspace } from "../src/workspace.ts"

const fixturesTasksDir = fileURLToPath(new URL("./fixtures/tasks", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "")
const git = (dir: string, ...args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" })

describe("loadTasks", () => {
  test("loads tasks", () => {
    const tasks = loadTasks(fixturesTasksDir)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.id).toBe("sample")
    expect(tasks[0]!.timeoutSec).toBe(600)
  })

  test("check is one command or named steps", () => {
    const root = mkdtempSync(join(tmpdir(), "tony-tasks-"))
    for (const [id, check] of [["one", "true"], ["steps", [{ name: "a", run: "true" }, { name: "b", run: "false" }]]] as const) {
      mkdirSync(join(root, id))
      writeFileSync(join(root, id, "task.json"), JSON.stringify({ prompt: "x", check }))
    }
    const [one, steps] = loadTasks(root)
    expect(one!.checks).toEqual([{ name: "check", run: "true" }])
    expect(steps!.checks).toEqual([
      { name: "a", run: "true" },
      { name: "b", run: "false" },
    ])
  })

  test("rejects malformed check steps", () => {
    const root = mkdtempSync(join(tmpdir(), "tony-tasks-"))
    mkdirSync(join(root, "bad"))
    writeFileSync(join(root, "bad", "task.json"), JSON.stringify({ prompt: "x", check: [{ name: "a" }] }))
    expect(() => loadTasks(root)).toThrow("task bad: missing check")
  })

  test("filters by id", () => {
    expect(loadTasks(fixturesTasksDir, ["nope"])).toEqual([])
  })

  test("rejects a task without check", () => {
    const root = mkdtempSync(join(tmpdir(), "tony-tasks-"))
    mkdirSync(join(root, "sample2"))
    writeFileSync(join(root, "sample2", "task.json"), '{"prompt":"x"}')
    expect(() => loadTasks(root)).toThrow("task sample2: missing check")
  })
})

describe("buildConfig", () => {
  test("baseline config has no tony plugin", () => {
    const c = buildConfig({ variant: "baseline", tonyHome: "/t", langfuse: false, tags: [] })
    expect(c.plugins).toBeUndefined()
    expect(c.experimental).toBeUndefined()
    expect(c.agents).toBeUndefined()
  })

  test("tony config", () => {
    const expected = JSON.parse(readFileSync(join(repoRoot, "config/opencode.json"), "utf8"))
    expected.plugins[0].package = join(repoRoot, "packages/opencode-plugin")
    expect(buildConfig({ variant: "tony", tonyHome: repoRoot, langfuse: false, tags: [] })).toEqual(expected)
  })

  test("langfuse adds the plugin with tags", () => {
    for (const variant of ["baseline", "tony"] as const) {
      const c = buildConfig({ variant, tonyHome: repoRoot, langfuse: true, tags: ["tony", "sample"] })
      expect(c.plugins).toContainEqual({ package: LANGFUSE_PACKAGE, options: { tags: ["tony", "sample"] } })
    }
  })
})

describe("variants", () => {
  test("null options are plain opencode", () => {
    expect(buildConfig({ variant: "x", options: null, tonyHome: repoRoot, langfuse: false, tags: [] })).toEqual({})
  })

  test("variant options merge into the Tony plugin entry", () => {
    const c = buildConfig({ variant: "tony-no-gate", options: { gate: { enabled: false } }, tonyHome: repoRoot, langfuse: false, tags: [] }) as any
    expect(c.plugins[0].options).toEqual({ gate: { enabled: false } })
    expect(c.plugins[0].package).toEndWith("packages/opencode-plugin")
  })

  test("evals/variants.json loads; a non-object entry is rejected", () => {
    const known = loadVariants(join(repoRoot, "evals/variants.json"))
    expect(known.baseline).toBeNull()
    expect(known["tony-review"]).toEqual({ gate: { review: true } })
    const file = join(mkdtempSync(join(tmpdir(), "tony-variants-")), "v.json")
    writeFileSync(file, JSON.stringify({ x: 3 }))
    expect(() => loadVariants(file)).toThrow("variant x must be null or an object")
  })

  test("pickVariants keeps order, accepts both, names the known ones", () => {
    const known = { baseline: null, tony: {}, "tony-review": { gate: { review: true } } }
    expect(pickVariants("tony-review,baseline", known).map((v) => v.name)).toEqual(["tony-review", "baseline"])
    expect(pickVariants("both", known).map((v) => v.name)).toEqual(["baseline", "tony"])
    expect(() => pickVariants("nope", known)).toThrow("unknown variant nope; known: baseline, tony, tony-review")
  })

  test("an unknown variant exits 2", () => {
    const r = spawnSync("bun", [join(repoRoot, "packages/eval/src/cli.ts"), "--model", "x/y", "--variant", "nope", "--no-preflight"], { encoding: "utf8" })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("unknown variant nope; known: baseline, tony")
  })
})

describe("prepareWorkspace", () => {
  const task = () => loadTasks(fixturesTasksDir)[0]!

  test("copies the repo, writes the config and commits", async () => {
    const config = { hello: "world" }
    const dir = await prepareWorkspace(task(), config)
    expect(existsSync(join(dir, "README.md"))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8"))).toEqual(config)
    expect(git(dir, "rev-parse", "HEAD").status).toBe(0)
  })

  test("runs setup after the initial commit", async () => {
    const dir = await prepareWorkspace({ ...task(), setup: "echo x > untracked.txt" }, {})
    expect(git(dir, "status", "--porcelain").stdout).toContain("?? untracked.txt")
  })

  test("opencode.json is not committed", async () => {
    const dir = await prepareWorkspace(task(), {})
    expect(readFileSync(join(dir, ".git/info/exclude"), "utf8")).toContain("opencode.json")
    expect(git(dir, "status", "--porcelain").stdout).toBe("")
  })
})

describe("evals/tasks", () => {
  // A check that passes on the untouched repo can't tell a finished run from an idle one.
  for (const task of loadTasks(join(repoRoot, "evals/tasks"))) {
    test(`${task.id}: check fails on the untouched repo`, async () => {
      const dir = await prepareWorkspace(task, {})
      const empty = join(mkdtempSync(join(tmpdir(), "tony-final-")), "final.txt")
      writeFileSync(empty, "")
      expect(runChecks(task, dir, empty).passed).toBe(false)
    })
  }
})
