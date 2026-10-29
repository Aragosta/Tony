# Tony roadmap (ranked)

Backbone: opencode **V2, pinned at 2.2.1** (the research read 2.2.0 source; the plans were checked against the published 2.2.1 plugin types; see `research/v1-vs-v2.md`). Every item is a module in the single Tony plugin (`packages/opencode-plugin`) or a config default. Research behind each item: `research/opencode-gaps.md`, `research/plugins-review.md`, `research/prompt-patterns.md`.

Ranking rule: first what stops the agent from failing outright (loops, a bad prompt), then the measurement we need to tune everything else, then **whether the agent's "done" is true**, then context efficiency, then extras.

| Rank | Item | Why this rank | Size | Phase | Status |
|---|---|---|---|---|---|
| 1 | **Foundation**: repo scaffold, pinned opencode, plugin skeleton, options, config template (todo on, background compaction on, step caps, read-only `explore`), **128k local context** (server, opencode and Tony limits all 131072; Tony caps local models so compaction fires before the server truncates) | Everything else plugs into it; a mismatched local context silently breaks tool calling | S | 1 | Done |
| 2 | **`loop-guard`**: block the 3rd identical consecutive tool call, pause the root session at the 5th, reset after edits and on each new user prompt | V2 has no loop protection at all (V1 had one) | S | 1 | Done |
| 3 | **`prompt`**: own base prompt plus a local-model addendum, replacing the 111-word default | Biggest quality lever for the least code | S | 1 | Done |
| 4 | **Eval harness + Langfuse**: fixed task suite, `opencode run --format json`, A/B baseline vs tony, isolated config per run | Needed to tune everything else | M | 1 | Done; baseline on a real model still to run |
| 5 | **Completion gate**: when the agent stops, run the project's checks after its last change, and send it back for failing checks, a failed last action, changed tests, open todos or an announced-but-skipped action. Bounded rounds, one message per round, a final status | opencode treats "the model stopped talking" as done, and a failing test command as a successful tool call | M | 2 | Planned |
| 6 | **`edit-guard`**: refuse edits to unread or changed files | Prevents edits based on stale content | S | 2 | Planned |
| 7 | **`diagnostics`**: new compiler/lint errors appended to edit results | The main self-correction signal; V2 lost LSP feedback | M | 2 | Planned |
| 8 | **Judge** (optional, off by default): a side model checks the work against the request, after the automatic checks pass | Covers "did it do what was asked", which checks can't see | S | 2 | Planned |
| 9 | **Eval: false done**: metric for "finished but failed", gate status, error runs, four new tasks, opt-in integration tests against real opencode | Proves the gate works; Phase 1 bugs were only found end to end | M | 2 | Planned |
| 10 | **`context`**: dedupe repeated tool outputs, stub stale bulky outputs, cache-safe batches | Token savings and fewer derailments in long sessions | M | 3 | |
| 11 | **No-progress / repeated-text loop detection** (loop-guard v2) | Covers the loops v1 of the guard can't see | S | 3 | |
| 12 | **`agents`**: reviewer subagent that inspects with tools; cheap model for `explore` | A deeper second pass than the Phase 2 judge | S | 3 | |
| 13 | **`sandbox`**: bubblewrap / sandbox-exec around shell | Fewer permission prompts, safer autonomy | M | 4 | |
| 14 | **`factcheck`**: verify external claims via Exa/TinyFish | Only matters for knowledge answers; code is verified by 5–7 | M | 4 | |
| 15 | A/B in the eval: Copilot-style `task_complete` tool, Headroom, context-mode, edit healing, memory | Adopt only with measured gains | — | 4 | |

## How Tony decides "done" (Phase 2 decision)
We compared the two reference harnesses:
- **Copilot (autopilot)** requires a `task_complete` tool call. If the model stops without it, Copilot nudges it to continue, up to 5 times.
- **Claude Code** uses **Stop hooks**: scripts, prompts or verifier agents that can refuse the stop and say why, up to 8 times in a row.

Tony uses the **Claude Code model** as the core: verify evidence, not the model's claim. A correct finish costs no extra model call, and a refusal carries the concrete problem, such as failing test output. From Copilot it takes the **nudge for agents that stop part-way** (open todos, an announced but skipped action), but **not the `task_complete` tool**: an extra tool hurts small local models, and a wrong model calls it anyway. The tool stays an A/B experiment (row 15). The judge is optional because it costs one model call per finished turn.

## Phase 1 results (branch `tony/phase1-foundation`)
- Verified against real opencode 2.2.1 with a scripted model. With the same model repeating one call, plain opencode made 95 identical calls; Tony finished the task in 5 (2 blocked, then paused).
- Found and fixed during the build: opencode reads its directory from `$PWD`; a shared background server can hang runs (the eval uses `--standalone`); a globally installed Tony would leak into the eval baseline (each run now gets an isolated config).
- Deferred minors: option type checks, block wording for polling, variant order alternation, `TONY_HOME` quoting, process cleanup after normal exit, `"<undef>"` fingerprint collision. The adapter unit test is now part of Phase 2 Task 10, and showing infrastructure errors in the report is part of Phase 2 Task 12.

**Plans:** Phase 1 `superpowers/plans/2026-10-29-tony-phase1-foundation.md`; Phase 2 `superpowers/plans/2026-10-29-tony-phase2-completion-gate.md`. Phases 3+ get their own plans once the previous phase ships.
