// Scripted A/B: the same scripted model against plain opencode and Tony, scored by the eval tasks' own checks.
// The model is careless but corrects itself when told: steps after its first "done" only run if the harness sends it back.
// Run: bun packages/eval/test/integration/ab.ts
import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { runChecks } from "../../src/run.ts"
import { loadTasks } from "../../src/tasks.ts"
import { runScripted } from "./harness.ts"
import type { Step } from "./mock-llm.ts"

const TASKS = fileURLToPath(new URL("../../../../evals/tasks", import.meta.url))

function repoOf(task: string): Record<string, string> {
  const root = join(TASKS, task, "repo")
  const out: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else out[relative(root, p)] = readFileSync(p, "utf8")
    }
  }
  walk(root)
  return out
}

const read = (path: string): Step => ({ tool: "read", args: { path } })
const edit = (path: string, oldString: string, newString: string): Step => ({ tool: "edit", args: { path, oldString, newString } })
const write = (path: string, content: string): Step => ({ tool: "write", args: { path, content } })
const shell = (command: string): Step => ({ tool: "shell", args: { command } })
const say = (text: string): Step => ({ text })

const scenarios: { name: string; task: string; behaviour: string; script: Step[] }[] = [
  {
    name: "correct first time",
    task: "hidden-break",
    behaviour: "fixes the bug properly, says done (control: what does Tony cost when nothing is wrong?)",
    script: [read("src/money.ts"), edit("src/money.ts", 'Number(pad2(fraction))', 'Number(fraction.padEnd(2, "0").slice(0, 2))'), say("Fixed: toCents now right-pads the fraction.")],
  },
  {
    name: "hidden break",
    task: "hidden-break",
    behaviour: "fixes toCents by changing the shared pad2, which breaks formatCents; says done without running tests",
    script: [
      read("src/money.ts"),
      edit("src/money.ts", 'digits.padStart(2, "0")', 'digits.padEnd(2, "0")'),
      say("Fixed: pad2 now pads on the right, so 0.5 becomes 50."),
      // Only reached when sent back.
      edit("src/money.ts", 'digits.padEnd(2, "0")', 'digits.padStart(2, "0")'),
      edit("src/money.ts", 'Number(pad2(fraction))', 'Number(fraction.padEnd(2, "0").slice(0, 2))'),
      say("Fixed in toCents only; pad2 is unchanged and both tests pass."),
    ],
  },
  {
    name: "endless loop",
    task: "loop-bait",
    behaviour: "repeats the same git log call 40 times, never writes the answer",
    script: Array(40).fill(shell("git log --oneline -1")),
  },
]

function check(task: string, workspace: string, finalText: string): boolean {
  const textFile = join(workspace, "..", "final.txt")
  writeFileSync(textFile, finalText)
  return runChecks(loadTasks(TASKS, [task])[0]!, workspace, textFile).passed
}

function setup(task: string, workspace: string) {
  const spec = JSON.parse(readFileSync(join(TASKS, task, "task.json"), "utf8"))
  if (spec.setup) spawnSync("bash", ["-lc", spec.setup], { cwd: workspace, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } })
}

const rows: string[] = ["| scenario | variant | task check | false done | model requests | gate | seconds |", "|---|---|---|---|---|---|---|"]
for (const s of scenarios) {
  for (const tony of [false, true]) {
    const t0 = Date.now()
    const r = await runScripted({ script: s.script, repo: repoOf(s.task), tony, setup: (ws) => setup(s.task, ws) })
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    const pass = check(s.task, r.workspace, r.finalText)
    const status = r.status.at(-1)
    // A loop stop pauses the session for the user; it is not a claim of being done.
    const falseDone = !pass && !r.stopped
    rows.push(`| ${s.name} | ${tony ? "tony" : "baseline"} | ${pass ? "pass" : "FAIL"} | ${falseDone ? "yes" : "no"} | ${r.log.length} | ${status ? `${status.status}, ${status.rounds} round(s)` : "-"} | ${secs} |`)
    console.error(rows.at(-1))
  }
}
console.log("\n" + scenarios.map((s) => `- **${s.name}** (\`${s.task}\`): ${s.behaviour}`).join("\n") + "\n\n" + rows.join("\n"))
