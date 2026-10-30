# Tony roadmap

**Product:** Tony is opencode's desktop app and engine at a pinned version (2.2.1), unmodified, with Tony's plugin
(`packages/opencode-plugin`) always loaded. See `architecture.md`. App track: CI builds for macOS and Windows, daily
opencode update PRs, then signing and published downloads, then Tony's own panels (gate status).

**Rule:** a feature ships on by default only after the eval shows it helps a real model. Each experiment is an option,
off by default, with its own variant in `evals/variants.json`. Background: `research/back-to-basics.md`.

## What Tony is now
| Feature | Evidence |
|---|---|
| Loop guard: block the 3rd identical call, pause at the 5th | Scripted only: 95 identical calls became 5. Qwen showed no loops in the diagnostic runs. |
| Local 128k context cap | Mechanism only; no task reaches the window yet. |
| Completion gate: failing checks go back with the output; `Blocked:` stops | Scripted only (`hidden-break`). On Qwen it rarely fires: the visible checks are green when it fails. |
| Prompt addition (~120 words, appended to opencode's, names the checks, `Blocked:` exit) | One trace each for the check command and `Blocked:`. Not measured on its own yet. |

## Next, in order
| # | Item | Why | Status |
|---|---|---|---|
| 1 | **`gate.review` A/B** on `evals/diag`: `baseline,tony,tony-review`, `--repeat 3` | First diagnostic runs (Qwen, 10 runs): every failure was `incomplete-fix`, visible tests green, hidden cases red. Two of the six were on `stale-cache`, whose grader was unfair (since fixed), so the clear cases are `async-pool` and `calc-spec`. The first `tony-review` run on `stale-cache` fixed both invalidation sites. | Built, waiting for the run |
| 2 | **One-feature-off runs**: `tony-no-prompt`, `tony-no-gate`, `tony-no-loop-guard` | The four kept features have scripted or single-trace evidence only | Variants exist |
| 3 | **A long-context task** in `evals/diag` | Needed before any context work can be measured | |
| 4 | **Stale tool-output clearing**, cache-safe batches | Claude Code and Copilot both keep context small; measured on item 3 | |
| 5 | **Reminders via `instructions.entry`**: files changed outside the agent, re-grounding after compaction | Claude Code's attachments; cache-safe in opencode | |
| 6 | Experiments from the failure-mode table of later diagnostic runs | Features follow observed failures | |
