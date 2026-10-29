# Phase 1 + 2 review (2026-10-29)

Scope: everything on the branch up to `a3f58d3`. That covers loop guard, prompt, local context and eval (Phase 1), plus the completion gate, edit guard, diagnostics, judge and false-done eval (Phase 2). It was tested, compared with Claude Code and Copilot, and fixed where testing found problems.

## Test results
| Suite | Before review | After |
|---|---|---|
| Unit (`bun test`) | 155 pass, 6 opt-in skips | 166 pass, 8 opt-in skips |
| Typecheck (both packages) | clean | clean |
| Integration, real opencode 2.2.1 + scripted model (`TONY_INTEGRATION=1`) | 6/6 | 8/8 |

Scripted A/B (`bun packages/eval/test/integration/ab.ts`): the same careless-but-correctable scripted model, with and without Tony.

| Scenario | Plain opencode | Tony before | Tony after |
|---|---|---|---|
| correct first time (control) | pass | pass, 0 rounds, +0.3 s | pass, 0 rounds |
| hidden break (fix breaks another test) | **false done** | pass, 1 round | pass, 1 round |
| tamper (deletes the failing test) | **false done** | pass, 1 round | pass, 1 round |
| half done (announces the rest, stops) | **false done** | **false done, gate said `verified`** | pass, 2 rounds |
| endless loop (same call 40×) | 41 requests | 5 requests, scored as false done | 5 requests, paused for the user |

Totals after the fixes: plain opencode passes 1/5 with 4 false dones; Tony passes 4/5 with 0 false dones. The loop run fails by design: it pauses for the user, and a scripted model can't answer.

**These are scripted runs.** They prove the mechanisms work inside real opencode. They don't show how much a real model improves. That needs the local-model eval (see "Next" below).

## Bug found: the gate missed edit-guard refusals
- **Symptom.** In "half done", the model writes `test/cli.test.ts` without reading it first. The edit guard refuses the write, the model says "README and test updated", the old tests still pass, and the gate records **`verified`**. Tony was certifying a false done.
- **Root cause, confirmed with a probe plugin.** opencode 2.2.1 **does not fire `execute.after` for a call a `before` hook rejected**. The evidence tracker only listened to `after`, so a refused edit looked like it never happened, and the gate didn't know it had failed. The unit tests' fake host did call `after` for refused calls, which hid the problem.
- **Fix** (`2184e49`):
  - The edit guard reports each refusal to `EvidenceTracker.refused()`. The wiring lives in the new `src/register.ts`.
  - The fake host's `call()` now behaves like opencode: no `after` when `before` throws.
  - Regression tests at three levels: unit, wired (`register.test.ts`), and real opencode.
- **Lesson.** The fake host must model the host's quirks, not an idealised host. Any new hook interaction gets one real-opencode integration case.

## Other changes in this round
- **Efficiency: no duplicate test runs** (`2184e49`).
  - When the agent already ran a check successfully after its last change, the gate doesn't run it again.
  - A run counts when it was the same command, the same package script under another manager, or the script's body (for example `bun test` for `npm run test`).
  - The status log marks such checks `reused`.
  - Saves one full test run per finished request whenever the agent verified its own work, which the prompt asks for.
- **Efficiency: one session lookup per session.** The gate looks up a session's directory once instead of making 2 RPCs per tool call.
- **Prompt** (`feat(prompt)`):
  - "re-read the request and check each part is done" (targets half-done finishes).
  - "report failures that predate your change instead of fixing them" (keeps the agent in scope).
  - Hosted models get a line on batching independent read-only calls. Local models keep "one call per need", because small models often break parallel calls.
- **Eval fidelity** (`5729ec2`): a loop stop is no longer scored as a false done in the A/B, and "half done" now models a model that recovers from the edit guard.

## Review notes (no change needed now)
- **Architecture holds up.** Only `index.ts` touches `@opencode/plugin`, every module sits behind `Host`, each nudge has a key and goes out at most once, rounds are capped, and the gate never blocks on its own errors.
- **Diagnostics cost on large TypeScript projects.** `tsc --noEmit` runs on the whole project after every edit. With a 20 s timeout, large repos switch it off for the session. Phase 3 should use `--incremental` with the buildinfo file in tmp.
- **Pre-existing failures.** The gate can't tell a failure the agent caused from one that was already there. The new wording lets the agent report it instead of fixing it, so it costs at most one round. A real baseline would need running checks before the first edit, so wait for eval data.
- **Deferred minors still open** (from Phase 1, unchanged): option type checks, loop-guard block wording for polling, `TONY_HOME` quoting, the `"<undef>"` fingerprint collision.

## Tony vs Claude Code vs Copilot
What each does well, and where Tony stands:

| Capability | Claude Code | Copilot | Tony now | Gap / plan |
|---|---|---|---|---|
| Don't accept "done" without evidence | Stop hooks (scripts/agents can refuse the stop) | autopilot: `task_complete` tool + nudges | **Evidence gate**: runs checks, catches failed last action, test tampering, open todos, announced-but-skipped steps; optional judge | Ahead for local models: no extra tool, concrete reasons, a correct finish costs nothing |
| Read-before-edit, stale-file guard | yes | no | **yes**, and refusals now reach the gate | — |
| New-only diagnostics after edits | via hooks/IDE | yes (LSP) | **yes** (tsc/ruff/go vet) | Slower than LSP on big TS repos → `--incremental` (Phase 3) |
| Loop protection | partial | partial | **yes** (identical calls) | No-progress, A/B alternation, narrated-call loops (Phase 3) |
| Test-tampering detection | no | no | **yes** | — |
| Strong system prompt | long, tuned | long, per-model | Own prompt + local addendum | Tune against a real local model |
| Parallel tool calls | encouraged | encouraged | hosted models only | Measure on local models before enabling |
| **Cache-safe reminders** (`<system-reminder>`: stale todos, files changed outside the agent, re-grounding after compaction) | **yes, heavily used** | partial | **no** | **New Phase 3 item**: `reminders` via `instructions.entry` |
| Clearing old tool output | context editing / microcompact | background summarisation | no (opencode compaction only) | Phase 3 `context` |
| Cheap read-only explore subagent | Explore (small model) | search subagent | read-only `explore`, same model | Set a fast local model for `explore` |
| Reviewer subagent with tools | via agents | no | judge without tools (opt-in) | Phase 3 `agents` |
| Edit healing (side model repairs failed `oldString`) | no | yes | no | Phase 4, measure first |
| Plan mode / thinking budget | yes | yes | opencode `plan` agent | Not a Tony gap; revisit if eval shows planning failures |
| Persistent memory | CLAUDE.md / memory | memory tool | AGENTS.md | Phase 4 |

**Where Tony is ahead:**
- An evidence-based stop with no extra tool, which matters for small local models.
- Test-tampering detection.
- An eval that measures false done directly.

**Biggest gaps for "smarter and efficient":**
1. Cache-safe reminders that keep the model grounded during long tasks.
2. Clearing stale tool output.
3. A real-model baseline to tune against.

## Next (re-ranked Phase 3; see `../roadmap.md`)
1. **Run the eval on the local model** (`bun packages/eval/src/cli.ts --model llamacpp/local --repeat 3`) and record pass rate and false done for baseline vs Tony. Every later item is judged against this.
2. `context`: clear stale or duplicate tool output in cache-safe batches.
3. `reminders` via `instructions.entry`: open todos that went stale, files changed outside the agent, a re-grounding note after compaction.
4. Loop guard v2: no progress, alternation, narration without a call.
5. `agents`: reviewer subagent with read-only tools; fast model for `explore`.
6. Diagnostics speed: `tsc --incremental`.
