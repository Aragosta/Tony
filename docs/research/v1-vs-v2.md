# opencode V1 vs V2: which one Tony builds on

Date: 2026-10-29. Compared the `v1` branch (v1.19.5, npm `opencode-ai`) with `dev`/`main` (v2.2.1, npm `@opencode/cli`).

## Status
| | V1 | V2 |
|---|---|---|
| Latest release | 1.19.5 (2026-10-28) | 2.2.1 (2026-10-29) |
| Where | `v1` branch, `opencode-ai` / `@opencode-ai/plugin` | `dev` (default) branch, `@opencode/cli` / `@opencode/plugin` |
| Activity since Aug 2026 | 60 commits, ~10 `feat`. Mostly CI, release and dependency fixes | Main line. 11 releases between 2026-10-08 and 2026-10-27 |
| README install | — | V2 is the default (`opencode.ai/v2/install`) |
| Plugin API | Stable, large ecosystem (DCP, supermemory, …) | **Beta**. V1-only plugins don't load |

So V1 is in **maintenance**: it gets fixes, not features. V2 is where development happens.

## What V1 has that V2 lacks
- **LSP diagnostics after edits** (`tool/edit.ts` calls `lsp.diagnostics()`), plus an `lsp` tool. In V2 this is still a TODO.
- **Tool-output pruning** (`session/compaction.ts`: protects the newest 40k tokens of tool output, prunes older ones; opt-in `compaction.prune`).
- A mature plugin ecosystem and a stable hook API (`tool.execute.*`, `experimental.chat.messages.transform`, `experimental.session.compacting`, `permission.ask`, `shell.env`, `tool.definition`).

## What V2 has that V1 lacks (the hooks Tony depends on)
- `session.hook("experimental.idle")`: a real stop hook that can inject follow-up work. Needed for `tony.verify` and `tony.factcheck`.
- `session.hook("context")`: mutate system, messages and tools for every request, with model and agent known.
- `session.hook("compaction")` with a typed `result`, background precomputed compaction, and `keepID` references.
- `session.instructions.entry.*`: reminders that don't break the prompt cache and survive compaction.
- `ctx.websearch.query` with Exa / TinyFish / Firecrawl / Parallel / Tavily, and `ctx.experimental.generate` for side-model calls (judge, claim extraction).
- `permission.hook("evaluate")`, `shell.hook("create.before")` (sandbox wrapping), the `/goal` loop, Code Mode `search()`, tool-input repair, `retry` and `model.request` hooks, prompt-cache TTL and warming.

## Decision: V2, with a guard
- **Why V2:** Tony is a long-lived project. V1 is frozen, so anything we need from it later we'd have to patch ourselves. V2 already has most of the extension points Tony's plan uses (idle, context, compaction, instructions, websearch, generate). The two things V1 does better, LSP feedback and tool-output pruning, are on our build list anyway (`tony.diagnostics`, `tony.context`), and V1's code shows how to do both.
- **Cost:** the beta API breaks between releases (2.1 and 2.2 both had breaking changes), and the V1 plugin ecosystem doesn't carry over.
- **Guard:**
  1. Pin the exact V2 version and upgrade only after the eval passes.
  2. Keep Tony's logic in plain modules behind a thin adapter.
  3. Where it's cheap, export both entry points, `{ id, server, setup }`, as Headroom and Langfuse do. The plugin then also runs on V1.

## When V1 would be the right call instead
- We need a stable base **this month** and can't spend time on upgrades.
- We depend on a V1-only plugin, such as DCP.
- We won't build our own LSP and pruning.

Then: start on V1 1.19.x, write plugins that export both entry points, and move to V2 once its plugin API leaves beta.
