// Markdown for diagnostic runs: one page per run (the whole path from prompt to answer) and one summary per suite.
import type { DiagContext, Diagnosis, Finding } from "./diagnose.ts"
import { describeCall } from "./diagnose.ts"
import type { Timeline } from "./timeline.ts"

/** Everything a run page needs besides the events; saved next to them so `--replay` can rebuild the page. */
export interface RunMeta extends DiagContext {
  taskId: string
  prompt: string
  variant: string
  model: string
  /** 1-based repeat number. */
  run: number
  durationMs: number
  exitCode: number | null
  stderrTail: string
}

const OUTPUT_CHARS = 4000
const fence = (text: string, lang = "") => `~~~~${lang}\n${text.replace(/~~~~/g, "~ ~ ~ ~")}\n~~~~`
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more characters)` : s)
const oneLine = (s: string, n: number) => {
  const l = s.replace(/\s+/g, " ").trim()
  return l.length > n ? l.slice(0, n - 1) + "…" : l
}
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")
const ICON: Record<Finding["severity"], string> = { bad: "🔴", warn: "🟡", info: "⚪" }

export const OUTCOME_LABEL: Record<Diagnosis["outcome"], string> = { pass: "PASS", fail: "FAIL", timeout: "TIMEOUT", error: "ERROR" }

export function runPage(meta: RunMeta, t: Timeline, d: Diagnosis, diff = ""): string {
  const out: string[] = []
  out.push(`# ${meta.taskId} · ${meta.variant} · run ${meta.run}: ${OUTCOME_LABEL[d.outcome]}`)
  out.push("")
  out.push(`Model \`${meta.model}\`, ${(meta.durationMs / 1000).toFixed(0)} s, exit code ${meta.exitCode ?? "none"}.`)
  if (meta.hints.skill) out.push(`- **Tests:** ${meta.hints.skill}`)
  if (meta.hints.trap) out.push(`- **Trap:** ${meta.hints.trap}`)
  out.push(`- **Prompt:** ${meta.prompt}`)
  out.push("")
  out.push("## Prompt to answer")
  out.push(d.path || "(no steps)")
  out.push("")
  if (d.outcome === "pass") out.push(`**Result:** passed every check.`)
  else out.push(`**Result:** ${OUTCOME_LABEL[d.outcome]}${meta.failedCheck ? ` at check "${meta.failedCheck}"` : ""}.`)
  if (d.wrongTurn) out.push(`**First wrong turn:** ${d.wrongTurn.step ? `step ${d.wrongTurn.step}, ` : ""}\`${d.wrongTurn.kind}\`: ${d.wrongTurn.detail}`)
  out.push("")

  out.push("## Findings")
  if (d.findings.length === 0) out.push("None.")
  else {
    out.push("| | step | kind | detail |", "|---|---|---|---|")
    const order = { bad: 0, warn: 1, info: 2 }
    for (const f of [...d.findings].sort((a, b) => order[a.severity] - order[b.severity] || (a.step ?? 0) - (b.step ?? 0))) {
      out.push(`| ${ICON[f.severity]} | ${f.step ?? "-"} | \`${f.kind}\` | ${cell(f.detail)} |`)
    }
  }
  out.push("")

  const s = d.stats
  out.push("## Numbers")
  out.push(
    `| steps | tool calls | failed calls | parallel steps | thinking (chars, steps) | tokens in / out / thinking | cache read | seconds (in tools) | files read / edited | check runs |`,
    "|---|---|---|---|---|---|---|---|---|---|",
    `| ${s.steps} | ${s.calls} | ${s.failedCalls} | ${s.parallelSteps} | ${k(s.reasoningChars)}, ${s.stepsWithReasoning} | ${k(s.tokens.input)} / ${k(s.tokens.output)} / ${k(s.tokens.reasoning)} | ${k(s.tokens.cacheRead)} | ${s.seconds.toFixed(0)} (${s.toolSeconds.toFixed(0)}) | ${s.filesRead} / ${s.filesEdited} | ${s.checkRuns} |`,
  )
  out.push("")

  out.push("## Timeline")
  const byStep = new Map<number, Finding[]>()
  for (const f of d.findings) if (f.step) byStep.set(f.step, [...(byStep.get(f.step) ?? []), f])
  for (const st of t.steps) {
    const secs = st.startedAt && st.endedAt ? ` · ${((st.endedAt - st.startedAt) / 1000).toFixed(1)} s` : ""
    out.push(`### Step ${st.index}${secs} · in ${k(st.tokens.input)} / out ${k(st.tokens.output)}${st.tokens.reasoning ? ` / thinking ${k(st.tokens.reasoning)}` : ""}${st.finish ? ` · ${st.finish}` : ""}`)
    for (const f of byStep.get(st.index) ?? []) out.push(`> ${ICON[f.severity]} \`${f.kind}\`: ${f.detail}`)
    if (st.reasoning.trim()) {
      out.push(`<details><summary>💭 Thinking (${st.reasoning.length} chars): ${cell(oneLine(st.reasoning, 140))}</summary>`, "", fence(st.reasoning), "", "</details>")
    }
    for (const c of st.calls) {
      const failed = c.status === "error" || (c.exit !== undefined && c.exit !== 0)
      const exit = c.exit !== undefined ? `, exit ${c.exit}` : ""
      const lines = c.output.split("\n").length
      out.push("", `- ${failed ? "✗" : "🔧"} \`${cell(describeCall(c))}\`${exit} · ${c.ms} ms`)
      const input = Object.fromEntries(Object.entries(c.input).filter(([key]) => !["command", "path", "filePath"].includes(key)))
      if (Object.keys(input).length > 0) out.push(`  <details><summary>input</summary>`, "", indent(fence(clip(JSON.stringify(input, null, 2), OUTPUT_CHARS), "json")), "", "  </details>")
      if (c.output.trim()) out.push(`  <details${failed ? " open" : ""}><summary>${c.status === "error" ? "error" : `output (${lines} lines)`}</summary>`, "", indent(fence(clip(c.output, OUTPUT_CHARS))), "", "  </details>")
    }
    if (st.text.trim()) out.push("", ...st.text.trim().split("\n").map((l) => `> 💬 ${l}`))
    out.push("")
  }

  out.push("## Final answer", d.finalText.trim() ? fence(d.finalText.trim()) : "(none)", "")
  out.push(`## Grader${meta.failedCheck ? `: failed at "${meta.failedCheck}"` : ""}`, fence(clip(meta.checkOutput || "(no output)", OUTPUT_CHARS)), "")
  out.push(`## Changed files`, meta.changedFiles.length ? meta.changedFiles.map((f) => `- ${f}`).join("\n") : "None.", "")
  if (diff.trim()) out.push("## Diff", fence(clip(diff, 40_000), "diff"), "")
  if (t.errors.length || (meta.exitCode !== 0 && meta.stderrTail.trim())) out.push("## opencode stderr (tail)", fence(meta.stderrTail.trim() || t.errors.join("\n")), "")
  return out.join("\n")
}

const indent = (s: string) =>
  s
    .split("\n")
    .map((l) => "  " + l)
    .join("\n")

export interface SummaryRow {
  meta: RunMeta
  d: Diagnosis
  /** The run page, relative to the summary. */
  page: string
}

export function summaryPage(rows: readonly SummaryRow[], title: string): string {
  const out: string[] = [`# ${title}`, ""]
  const variants = [...new Set(rows.map((r) => r.meta.variant))]
  const tasks = [...new Set(rows.map((r) => r.meta.taskId))]

  out.push("## Pass rate", `| task | ${variants.join(" | ")} |`, `|---|${variants.map(() => "---").join("|")}|`)
  for (const task of tasks) {
    const cells = variants.map((v) => {
      const rs = rows.filter((r) => r.meta.taskId === task && r.meta.variant === v)
      return rs.length ? `${rs.filter((r) => r.d.outcome === "pass").length}/${rs.length}` : "-"
    })
    out.push(`| ${task} | ${cells.join(" | ")} |`)
  }
  out.push("")

  out.push(
    "## Runs",
    "| task | variant | run | result | steps | calls (failed) | thinking | seconds | first wrong turn |",
    "|---|---|---|---|---|---|---|---|---|",
  )
  for (const r of rows) {
    const s = r.d.stats
    const turn = r.d.wrongTurn ? `${r.d.wrongTurn.step ? `step ${r.d.wrongTurn.step}: ` : ""}\`${r.d.wrongTurn.kind}\` ${cell(oneLine(r.d.wrongTurn.detail, 80))}` : "-"
    out.push(
      `| ${r.meta.taskId} | ${r.meta.variant} | [${r.meta.run}](${r.page}) | ${OUTCOME_LABEL[r.d.outcome]} | ${s.steps} | ${s.calls} (${s.failedCalls}) | ${k(s.reasoningChars)} | ${s.seconds.toFixed(0)} | ${turn} |`,
    )
  }
  out.push("")

  // How often each failure mode shows up, split by outcome: a mode common in failed runs and rare in passed ones is
  // what a feature should target.
  const kinds = new Map<string, { severity: Finding["severity"]; failed: number; passed: number; tasks: Set<string> }>()
  for (const r of rows) {
    for (const kind of new Set(r.d.findings.map((f) => f.kind))) {
      const f = r.d.findings.find((x) => x.kind === kind)!
      const e = kinds.get(kind) ?? { severity: f.severity, failed: 0, passed: 0, tasks: new Set<string>() }
      if (r.d.outcome === "pass") e.passed++
      else e.failed++
      e.tasks.add(r.meta.taskId)
      kinds.set(kind, e)
    }
  }
  const failedRuns = rows.filter((r) => r.d.outcome !== "pass").length
  const passedRuns = rows.length - failedRuns
  out.push(
    "## Failure modes",
    `Runs with each finding, out of ${failedRuns} failed and ${passedRuns} passed runs.`,
    "",
    "| | kind | failed runs | passed runs | tasks |",
    "|---|---|---|---|---|",
  )
  const order = { bad: 0, warn: 1, info: 2 }
  for (const [kind, e] of [...kinds].sort((a, b) => order[a[1].severity] - order[b[1].severity] || b[1].failed - a[1].failed)) {
    out.push(`| ${ICON[e.severity]} | \`${kind}\` | ${e.failed} | ${e.passed} | ${[...e.tasks].join(", ")} |`)
  }
  out.push("")

  const all = rows.map((r) => r.d.stats)
  const avg = (f: (s: (typeof all)[number]) => number) => (all.length ? all.reduce((a, s) => a + f(s), 0) / all.length : 0)
  out.push(
    "## Tool use and thinking, per run",
    "| steps | calls | failed calls | parallel steps | thinking chars | output tokens | seconds | share of time in tools |",
    "|---|---|---|---|---|---|---|---|",
    `| ${avg((s) => s.steps).toFixed(1)} | ${avg((s) => s.calls).toFixed(1)} | ${avg((s) => s.failedCalls).toFixed(1)} | ${avg((s) => s.parallelSteps).toFixed(1)} | ${k(Math.round(avg((s) => s.reasoningChars)))} | ${k(Math.round(avg((s) => s.tokens.output)))} | ${avg((s) => s.seconds).toFixed(0)} | ${Math.round((100 * avg((s) => s.toolSeconds)) / Math.max(1e-9, avg((s) => s.seconds)))}% |`,
    "",
  )
  return out.join("\n")
}
