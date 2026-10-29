import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadTasks } from "../src/tasks.ts"
import { buildConfig, LANGFUSE_PACKAGE, prepareWorkspace } from "../src/workspace.ts"

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
    expected.plugins[0].package = `${repoRoot}/packages/opencode-plugin`
    expect(buildConfig({ variant: "tony", tonyHome: repoRoot, langfuse: false, tags: [] })).toEqual(expected)
  })

  test("langfuse adds the plugin with tags", () => {
    for (const variant of ["baseline", "tony"] as const) {
      const c = buildConfig({ variant, tonyHome: repoRoot, langfuse: true, tags: ["tony", "sample"] })
      expect(c.plugins).toContainEqual({ package: LANGFUSE_PACKAGE, options: { tags: ["tony", "sample"] } })
    }
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
