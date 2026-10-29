# Tony roadmap (ranked)

Backbone: opencode **V2, pinned at 2.2.0** (see `research/v1-vs-v2.md`). Every item is a module in the single Tony plugin (`packages/opencode-plugin`) or a config default. Research behind each item: `research/opencode-gaps.md`, `research/plugins-review.md`, `research/prompt-patterns.md`.

Ranking rule: first what stops the agent from failing outright (loops, a bad prompt), then the measurement we need to tune everything else, then correctness feedback, then context efficiency, then extras.

| Rank | Item | Why this rank | Size | Plan |
|---|---|---|---|---|
| 1 | **Foundation**: repo scaffold, pinned opencode, plugin skeleton, options, config template (todo on, background compaction on, step caps, read-only `explore`) | Everything else plugs into it; the config gives free wins | S | Phase 1 |
| 2 | **`loop-guard`**: block the 3rd identical consecutive tool call, stop at the 5th, reset after edits | V2 has no loop protection at all (V1 had one). Loops are the most visible local-model failure | S | Phase 1 |
| 3 | **`prompt`**: own base prompt (~500 words) plus a local-model addendum, replacing the 111-word default | Biggest quality lever for the least code | S | Phase 1 |
| 4 | **Eval harness + Langfuse**: fixed task suite, `opencode run --format json`, score success, tokens, cache hits, steps, loop events | Needed to tune 3 and to prove 5–9 help | M | Phase 1 |
| 5 | **`edit-guard`**: reject edits to unread or changed files | Prevents a common silent-corruption failure | S | Phase 2 |
| 6 | **`diagnostics`**: LSP/tsc/linter errors appended to edit results (new errors only) | V2 lost this; it's the main self-correction signal | M | Phase 2 |
| 7 | **`verify`**: on idle, run project checks, feed back failures, bounded rounds | Turns "claims done" into "is done" | M | Phase 2 |
| 8 | **`context`**: dedupe repeated tool outputs, stub stale bulky outputs, cache-safe batches | Token savings and fewer derailments in long sessions | M | Phase 3 |
| 9 | **No-progress / repeated-text loop detection** (loop-guard v2) | Covers the loops v1 of the guard can't see | S | Phase 3 |
| 10 | **`agents`**: reviewer subagent; delegation guidance | Second pass on risky changes | S | Phase 3 |
| 11 | **`sandbox`**: bubblewrap / sandbox-exec around shell | Fewer permission prompts, safer autonomy | M | Phase 4 |
| 12 | **`factcheck`**: verify external claims via Exa/TinyFish | Only matters for knowledge answers; code is verified by 6–7 | M | Phase 4 |
| 13 | A/B in the eval: Headroom, context-mode, edit healing, memory | Adopt only with measured gains | — | Phase 4 |

**Phase 1 = rows 1–4** (plan: `superpowers/plans/2026-10-29-tony-phase1-foundation.md`). Phases 2+ get their own plans once the previous phase ships, so each plan reflects what we learned.
