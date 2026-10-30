# Back to Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Tony down to the four rules with evidence (loop guard, local context cap, checks-fail gate with a `Blocked:` exit, a short prompt addition), and make the eval measure each rule on its own.

**Architecture:** The plugin keeps its `Host` adapter (`src/index.ts`) and `registerTony` entry. Modules that are removed are deleted outright, with no options left behind. The gate keeps one reason, failing checks. The prompt is appended to opencode's `system[0]` instead of replacing it. The eval gets named variants, so a run can compare baseline, full Tony and Tony with one feature off.

**Tech Stack:** TypeScript on Bun 1.4.4, `bun:test`, opencode 2.2.1 plugin API (`@opencode/plugin` 2.2.1).

**Spec:** `docs/research/back-to-basics.md` (the "minimal Tony" table and the "what worked" verdicts).

## Global Constraints
- opencode stays pinned at 2.2.1. Only `packages/opencode-plugin/src/index.ts` imports `@opencode/plugin`.
- Checks: `bun test` (root) and `bun run typecheck` (root) both pass after every task.
- An old `tony.json` must still load. The keys `editGuard`, `diagnostics`, `gate.judge` and `tier` are ignored, never an error.
- The prompt addition is byte-identical on every request of a session (prompt cache), and at most 150 words.
- The gate never blocks the user on its own error. That rule stays: `try/catch` around idle.
- Copy rules for user-facing text: Tony's own wording; no third-party prompt text.

## Review Focus
1. A user's `tony.json` from 1.0.0 with `{"editGuard":{"enabled":false},"diagnostics":{...},"gate":{"judge":true},"tier":"small"}` loads without throwing, and Tony behaves as with `{}`. Pinned in Task 2.
2. An answer starting with `Blocked:` after checks fail ends as `needs-user` with no nudge. Pinned in Task 3.
3. An agent with its own system prompt (`explore`, `title`) gets no prompt addition. Pinned in Task 4.
4. The context hook runs twice for the same session: the addition appears once per request, and the text is identical both times. Pinned in Task 4.
5. `--variant` with a name not in `evals/variants.json` exits with code 2 and lists the known names. Pinned in Task 1.

---

### Task 1: Eval variants and cost columns

**Files:**
- Create: `evals/variants.json`
- Modify: `packages/eval/src/workspace.ts` (`Variant`, `buildConfig`), `packages/eval/src/cli.ts`, `packages/eval/src/report.ts`, `packages/eval/src/run.ts` (`RunOptions.variant`, tags)
- Modify: `evals/README.md` (flags table, report columns)
- Test: `packages/eval/test/workspace.test.ts` (create if missing), `packages/eval/test/report.test.ts`

**Interfaces:**
- Produces:
  - `type Variant = string`
  - `type VariantOptions = Record<string, unknown> | null` (null means plain opencode)
  - `loadVariants(file: string): Record<string, VariantOptions>`
  - `buildConfig({ variant, options: VariantOptions, tonyHome, langfuse, tags })`
  - `VariantSummary` gains `avgSeconds: number` and `avgTokens: number` (input + output + reasoning per run)

`evals/variants.json`, exactly:
```json
{
  "baseline": null,
  "tony": {},
  "tony-no-prompt": { "prompt": { "enabled": false } },
  "tony-no-gate": { "gate": { "enabled": false } },
  "tony-no-loop-guard": { "loopGuard": { "enabled": false } }
}
```

- [ ] **Step 1: Write the failing tests**
  - `buildConfig with null options is plain opencode`: `buildConfig({ variant: "baseline", options: null, ... })` deep-equals `{}`.
  - `buildConfig merges variant options into the Tony plugin entry`: with `{ gate: { enabled: false } }`, `config.plugins[0].options` deep-equals `{ gate: { enabled: false } }` and `config.plugins[0].package` ends with `packages/opencode-plugin`.
  - `loadVariants rejects a non-object entry`: a file with `{"x": 3}` throws `variant x must be null or an object`.
  - `summarize keeps variants in the order they first appear`: results for `tony-no-gate` then `baseline` → summary variants `["tony-no-gate","baseline"]`.
  - `summarize reports seconds and tokens per run`: two runs of 10 s and 20 s with 100 and 300 total tokens → `avgSeconds` 15, `avgTokens` 200.
  - `unknown variant exits 2`: spawn `bun packages/eval/src/cli.ts --model x/y --variant nope --no-preflight`; the exit code is 2, and stderr contains `unknown variant nope; known: baseline, tony`.

- [ ] **Step 2: Run them, expect failures** — `bun test packages/eval` (FAIL: `loadVariants` not defined).

- [ ] **Step 3: Implement**
  - `--variant` takes a comma list. The default is `baseline,tony`; `both` is kept as an alias for `baseline,tony`.
  - An unknown name prints `unknown variant <name>; known: baseline, tony, …` and exits 2.
  - `report.ts` drops the fixed `VARIANTS` list and orders variants by first appearance.
  - The summary table gains `s/run` and `tokens/run` columns.
  - The per-task table drops the `tier` column, and `GateRecord` drops `judge` and `tier`.
  - The preflight still uses `tony`.

- [ ] **Step 4: Run** `bun test packages/eval && bun run typecheck` — PASS.

- [ ] **Step 5: Commit** — `feat(eval): named variants for one-feature-off runs; seconds and tokens per run`

### Task 2: Remove edit guard, diagnostics, judge and tiers

**Files:**
- Delete: `src/core/edit/`, `src/core/diagnostics/`, `src/core/gate/judge.ts`, `src/tiers/` (all under `packages/opencode-plugin/`)
- Delete tests: `test/edit-guard.test.ts`, `test/diagnostics.test.ts`, `test/judge.test.ts`, `test/tiers.test.ts`
- Create: `src/core/context/local.ts` (moved from `src/tiers/small/context.ts` and `match.ts`), with `test/local-context.test.ts` updated to import it
- Modify: `src/options.ts`, `src/register.ts`, `src/host.ts` (drop `judge`, `agentHasCustomSystem` stays), `src/index.ts` (drop `judge`), `test/fake-host.ts`, `test/options.test.ts`, `test/register.test.ts`, `src/core/gate/register.ts` (judge block and `tiers` dep), `src/core/gate/status.ts` (drop `judge`, `tier`)

**Interfaces:**
- Produces:
  - `TonyOptions = { loopGuard, prompt, local, gate }`
  - `GateOptions = { enabled, maxRounds, checks, checkTimeoutMs }`
  - `registerLocalContext(host: Host, local: LocalOptions): Promise<void>`, `planContextCaps(models, local): ContextCap[]` and `isLocal(providerID, local): boolean` in `src/core/context/local.ts`
  - `registerTony(host, o, gate?: { exec, detect })`

- [ ] **Step 1: Write the failing test** in `test/options.test.ts`, `old tony.json keys are ignored`: `parseOptions({ editGuard: { enabled: false }, diagnostics: { enabled: false }, gate: { judge: true }, tier: "small" })` does not throw, has no `editGuard`, `diagnostics` or `tier` key, and `gate` deep-equals `{ ...DEFAULTS.gate }` plus `judge: true`. Copy the extra key along; it's harmless, and nothing reads it.
- [ ] **Step 2: Run** `bun test packages/opencode-plugin/test/options.test.ts`. Expect FAIL, because `tier: "small"` validation still runs.
- [ ] **Step 3: Implement.**
  - Delete the modules and their tests, including the edit-guard regression test in `test/register.test.ts`.
  - Move the local context cap and register it in `registerTony` directly after the loop guard.
  - Remove the `tier` field and its validation from `parseOptions`.
  - Fix the imports.
- [ ] **Step 4: Run** `bun test && bun run typecheck`. Expect PASS.
- [ ] **Step 5: Commit** — `refactor(brain): remove edit guard, diagnostics, judge and model tiers`

### Task 3: Gate with one reason, failing checks

**Files:**
- Create: `src/core/gate/changes.ts` (`ChangeTracker`, plus `patchFiles` moved from `tamper.ts`)
- Delete: `src/core/gate/evidence.ts`, `src/core/gate/tamper.ts`, `test/evidence.test.ts`, `test/tamper.test.ts`
- Modify: `src/core/gate/decide.ts`, `src/core/gate/text.ts`, `src/core/gate/register.ts`, `src/core/verify/detect.ts` (delete `normalizeCheck`, `checkAliases`), `test/decide.test.ts`, `test/gate.test.ts`, `test/verify.test.ts`, `test/register.test.ts`

**Interfaces:**
- Consumes: `Exec`, `detectChecks` (unchanged)
- Produces:
  - `class ChangeTracker { beginTurn(sessionID): void; after(e: ToolAfterEvent, directory: string): void; addSnapshotFiles(sessionID, files: readonly string[]): void; changes(sessionID): { files: string[]; seq: number } }`
  - `decide(input: { checks: readonly CheckRun[]; finalText: string; changedFiles: number; rounds: number; seen: ReadonlySet<string>; maxRounds: number }): Decision`
  - `reportsBlocked(text)` (kept)
  - `CheckRun` loses `reused`

Rules (from the spec):
- The tracker counts a completed `edit`, `write` or `patch`, or new snapshot files.
- The gate runs the checks once per new `seq`, stopping at the first failure.
- A failing check is the only reason to continue, unless the answer is `Blocked:`.
- Status: `needs-user` when blocked; `unresolved` when failing at the cap; `verified` when all checks passed; `no-changes` when no files changed; `no-checks` otherwise.
- `text.ts` keeps `HEADER`, `FOOTER` and `checksSection` only.

- [ ] **Step 1: Write the failing tests** in `test/decide.test.ts`:
  - `failing check continues with its output`: `kind` is `continue`, the message contains the check output, the description is `Tony: checks failing`.
  - `blocked answer with failing checks stops as needs-user`: `finalText` is `"Blocked: STATUS_URL is not set"`, so the result is `{ kind: "stop", status: "needs-user" }`.
  - `same failure after the cap is unresolved`: `rounds` equals `maxRounds`, so the result is `stop` / `unresolved`.
  - `open todos and announced steps no longer continue`: passing checks and `finalText` `"Let me run the tests."` give `stop` / `verified`.

  And in `test/gate.test.ts`:
  - `checks run once per change`: two idles with no edit in between give 1 exec call.
  - `subagent sessions are ignored`: a session with `parentID` gives 0 exec calls.
- [ ] **Step 2: Run** `bun test packages/opencode-plugin/test/decide.test.ts packages/opencode-plugin/test/gate.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** The `StatusRecord` drops `testsChanged`.
- [ ] **Step 4: Run** `bun test && bun run typecheck`. Expect PASS.
- [ ] **Step 5: Commit** — `refactor(gate): one reason, failing checks; Blocked: still stops`

### Task 4: Prompt as a short addition

**Files:**
- Modify: `src/core/prompt/text.ts`, `src/core/prompt/select.ts`, `src/core/prompt/register.ts`, `test/prompt.test.ts`

**Interfaces:**
- Produces:
  - `ADDITION: string`
  - `promptAddition(checks: readonly string[]): string`
  - `registerPrompt(host, o, detect?)` (the `tiers` map parameter is gone)

The exact text of `ADDITION`. `{checks}` becomes `` (`bun run test`) `` with each command in backticks, comma-separated; with no checks it becomes an empty string:
```
# Tony
Your name is Tony.
- Read the files you will change before editing them. When you know several files you need, read them in one turn.
- Change only what was asked, in the style of the surrounding code.
- If a call fails, read the error and change something before trying again.
- After your last edit, run the project's checks once{checks}. If they fail, fix the cause. Never edit tests, hard-code expected outputs or remove error checks to make them pass.
- If the task needs something you don't have (a service, credentials, an environment variable), don't fake it. Start your answer with `Blocked:` and name what is missing.
- Keep going until the request is done, or until you hit a blocker you can name. Then answer briefly: what changed and what the checks printed.
```

- [ ] **Step 1: Write the failing tests:**
  - `appends to the base part`: `system[0].text` becomes `"OLD\n\n" + promptAddition([])`, and `system[1]` is unchanged.
  - `names detected checks`: with `detect` returning `["bun run test"]`, the text contains `` run the project's checks once (`bun run test`). ``
  - `identical across requests`: two context events for session `s` produce the same `system[0].text`, and `detect` is called once.
  - `skips agents with a custom system prompt` (kept).
  - `at most 150 words`: `promptAddition(["npm run typecheck","npm run lint","npm run test"]).split(/\s+/).length <= 150`.
- [ ] **Step 2: Run** `bun test packages/opencode-plugin/test/prompt.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** Delete `BASE`, `toolGuidance` and `assemblePrompt`; opencode's own tool guidance stays in `system[0]`.
- [ ] **Step 4: Run** `bun test && bun run typecheck`. Expect PASS.
- [ ] **Step 5: Commit** — `feat(prompt): add to opencode's prompt instead of replacing it`

### Task 5: Config, integration tests, docs

**Files:**
- Modify:
  - `config/opencode.json`: remove `"todo": true`; keep `background_compaction`, the step caps and `explore`.
  - `packages/eval/test/integration/opencode.test.ts`: keep the loop guard, "checks failing are sent back", "verified finish" and "round cap" tests. Drop the edit-guard, refusal, reuse and todo tests. Add `blocked answer is not sent back`.
  - `packages/eval/test/integration/ab.ts`: scenarios that rely on removed rules are dropped.
- Modify docs: `README.md` (feature list, options table, example `tony.json` without `judge`), `CHANGELOG.md` (Unreleased: what was removed and why, one line each), `docs/architecture.md` (no tiers), `docs/roadmap.md` (row 10 result; new rows: long-context eval task, then stale tool-output clearing, then reminders via `instructions.entry`, each measured as its own variant), `packages/opencode-plugin/package.json` description, `packages/desktop/overlay/.../service.ts:41` comment example.

- [ ] **Step 1:** Make the config and integration test changes.
- [ ] **Step 2: Run** `bun test && bun run typecheck`. Expect PASS. Then run `TONY_INTEGRATION=1 bun test packages/eval/test/integration`. Expect PASS, or skipped with the reason printed where opencode 2.2.1 isn't installed; say which in the commit message.
- [ ] **Step 3:** Make the doc changes. Check with `grep -rn "editGuard\|diagnostics\|judge\|tier" README.md docs/architecture.md config packages/*/src`, which should find no feature references.
- [ ] **Step 4: Commit** — `docs: Tony keeps loop guard, local context, checks gate and a short prompt`

### After the plan: the measurement run (manual, needs the Qwen server)
```bash
bun packages/eval/src/cli.ts --model llamacpp/local --variant baseline,tony,tony-no-prompt,tony-no-gate,tony-no-loop-guard --repeat 5
```
For each feature, keep it if turning it off lowers the pass rate or raises false dones; remove it if turning it off makes no difference except saving time.
