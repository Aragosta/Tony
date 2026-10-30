// Real opencode (the pinned version) + Tony against a scripted model. Opt in: TONY_INTEGRATION=1 bun test packages/eval/test/integration
// TONY_OPENCODE_BIN runs the suite against another engine, such as the one bundled in the Tony app.
import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { opencodeBinary } from "../../src/opencode-bin.ts"
import { runScripted } from "./harness.ts"

// Opted in means required: a missing or wrong opencode fails here instead of silently skipping the suite.
const enabled = process.env.TONY_INTEGRATION === "1"
const OPENCODE_VERSION = readFileSync(join(import.meta.dir, "../../../desktop/opencode-version"), "utf8").trim()

const REPO = {
  "package.json": JSON.stringify({ name: "fixture", private: true, type: "module", scripts: { test: "bun test" } }),
  "src/a.ts": "export const add = (a: number, b: number) => a + b\n",
  "test/a.test.ts": 'import { expect, test } from "bun:test"\nimport { add } from "../src/a.ts"\ntest("add", () => expect(add(1, 2)).toBe(3))\n',
}
const GATE_MESSAGE = "Before you finish:"
const count = (log: string[], text: string) => log.filter((l) => l.includes(text)).length

describe.skipIf(!enabled)("opencode integration", () => {
  test(`opencode ${OPENCODE_VERSION} is installed`, () => {
    expect(spawnSync(opencodeBinary(), ["--version"], { encoding: "utf8" }).stdout ?? "").toContain(OPENCODE_VERSION)
  })

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

  test("round cap", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      options: { gate: { maxRounds: 1 } },
      script: [
        { tool: "read", args: { path: "src/a.ts" } },
        { tool: "write", args: { path: "src/a.ts", content: "export const add = (a: number, b: number) => a - b\n" } },
        { text: "Done." },
        // A new failure that only the cap keeps from being sent.
        { tool: "write", args: { path: "src/a.ts", content: "export const add = (a: number, b: number) => a * b\n" } },
        { text: "Done." },
      ],
    })
    // The log repeats recent messages per request, so count rounds from the gate's own status.
    expect(r.status.at(-1)?.rounds).toBe(1)
    expect(r.status.at(-1)?.status).toBe("unresolved")
  }, 150000)

  test("a blocked answer is not sent back", async () => {
    const r = await runScripted({
      repo: REPO,
      tony: true,
      script: [
        { tool: "read", args: { path: "src/a.ts" } },
        { tool: "write", args: { path: "src/a.ts", content: "export const add = (a: number, b: number) => a - b\n" } },
        { text: "Blocked: the tests need ADD_SERVICE_URL, which is not set." },
        { text: "Should not be reached." },
      ],
    })
    expect(count(r.log, GATE_MESSAGE)).toBe(0)
    expect(r.status.at(-1)?.status).toBe("needs-user")
  }, 150000)
})
