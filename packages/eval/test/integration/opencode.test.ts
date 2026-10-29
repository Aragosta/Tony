// Real opencode 2.2.1 + Tony against a scripted model. Opt in: TONY_INTEGRATION=1 bun test packages/eval/test/integration
import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { runScripted } from "./harness.ts"

const enabled =
  process.env.TONY_INTEGRATION === "1" && spawnSync("opencode", ["--version"], { encoding: "utf8" }).stdout?.includes("2.2.1")

const REPO = {
  "package.json": JSON.stringify({ name: "fixture", private: true, type: "module", scripts: { test: "bun test" } }),
  "src/a.ts": "export const add = (a: number, b: number) => a + b\n",
  "test/a.test.ts": 'import { expect, test } from "bun:test"\nimport { add } from "../src/a.ts"\ntest("add", () => expect(add(1, 2)).toBe(3))\n',
}
const GATE_MESSAGE = "Before you finish:"
const count = (log: string[], text: string) => log.filter((l) => l.includes(text)).length

describe.skipIf(!enabled)("opencode integration", () => {
  test("loop guard (phase 1 regression)", async () => {
    const shell = { tool: "shell", args: { command: "git log --oneline -1" } }
    const r = await runScripted({ script: Array(6).fill(shell), repo: REPO, tony: true })
    expect(r.log.some((l) => l.includes("Blocked:"))).toBe(true)
    expect(r.log.length).toBeLessThanOrEqual(6)
  }, 150000)

  test("checks failing are sent back", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      script: [
        { tool: "read", args: { path: "src/a.ts" } },
        { tool: "write", args: { path: "src/a.ts", content: "export const add = (a: number, b: number) => a - b\n" } },
        { text: "Done." },
        { text: "I could not fix it." },
      ],
    })
    expect(r.log.some((l) => l.includes("The project's checks fail:"))).toBe(true)
    expect(r.status.at(-1)?.status).toBe("unresolved")
  }, 150000)

  test("verified finish", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      script: [
        { tool: "read", args: { path: "src/a.ts" } },
        { tool: "write", args: { path: "src/a.ts", content: "export const add = (a: number, b: number) => b + a\n" } },
        { text: "Done." },
      ],
    })
    expect(count(r.log, GATE_MESSAGE)).toBe(0)
    expect(r.status.at(-1)?.status).toBe("verified")
  }, 150000)

  test("edit guard", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      script: [{ tool: "edit", args: { path: "src/a.ts", oldString: "a + b", newString: "b + a" } }, { text: "Done." }],
    })
    expect(r.log.some((l) => l.includes("Edit refused: read src/a.ts"))).toBe(true)
  }, 150000)

  test("open todos", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      script: [{ tool: "todowrite", args: { todos: [{ content: "write docs", status: "pending" }] } }, { text: "Done." }, { text: "Stopping." }],
    })
    expect(r.log.some((l) => l.includes("Your todo list has open items:"))).toBe(true)
  }, 150000)

  test("round cap", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      options: { gate: { maxRounds: 1 } },
      script: [
        { tool: "read", args: { path: "src/a.ts" } },
        { tool: "write", args: { path: "src/a.ts", content: "export const add = (a: number, b: number) => a - b\n" } },
        { tool: "todowrite", args: { todos: [{ content: "write docs", status: "pending" }] } },
        { text: "Done." },
        // A fresh reason (tests changed) that only the cap keeps from being sent.
        { tool: "read", args: { path: "test/a.test.ts" } },
        { tool: "write", args: { path: "test/a.test.ts", content: 'import { test } from "bun:test"\ntest("add", () => {})\n' } },
        { text: "Done." },
      ],
    })
    // The log repeats recent messages per request, so count rounds from the gate's own status.
    expect(r.status.at(-1)?.rounds).toBe(1)
    expect(r.status.at(-1)?.status).toBe("unresolved")
    expect(r.status.at(-1)?.testsChanged.length).toBeGreaterThan(0)
  }, 150000)
})
