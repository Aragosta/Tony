# Dynamic Context Pruning, compared with Claude Code and Copilot (2026-10-30)

Sources, read from code:
- **DCP**: `Tarquinen/opencode-dynamic-context-pruning` v3.2.0 (`@tarquinen/opencode-dcp`, the opencode V2 release), about 11k lines of TypeScript.
  - **License: AGPL-3.0.** Tony is MIT: we can take ideas from it, not code.
  - **Status:** the README says development has slowed and new work moved to Sleev, the author's proxy for several harnesses.
- **Claude Code**: `mods/types/claude-code.d.ts` and the CHANGELOG.
- **Copilot Chat**: `agentIntent.ts`, `summarizer.ts`, `toolCallingLoop.ts`.
- **opencode 2.2.1**: `packages/core/src/session`.

## What DCP does
It runs on every request, in opencode's `context` and `compaction` hooks. It never edits stored history: it rewrites the outgoing request, replacing pruned content with placeholders.

1. **`compress`, a tool the model calls.** The model picks a closed range of the conversation, by injected message IDs (`<dcp-message-id>`), and writes an "exhaustive" summary that replaces it. Overlapping compressions nest the earlier summary inside the new one.
   - A `message` mode (experimental) compresses single messages instead.
   - Outputs of protected tools (`task`, `skill`, todos) are carried into the summary.
2. **Prompting to make the model use it.**
   - About 300 words added to the system prompt ("context management is paramount"), and a ~700-word tool description.
   - Nudges as `<dcp-system-reminder>` blocks:
     - after each user message;
     - after 15 messages without one;
     - every 5th request above `maxContextLimit` (100k tokens by default), a "CRITICAL WARNING: you MUST use compress now".
   - Nudges are pinned to fixed anchor messages, so the same text appears in the same place on every request.
3. **Automatic strategies, no model involved.**
   - **Deduplication:** for identical calls (same tool, same arguments), only the latest output is kept.
   - **Purge errors:** after 4 turns, the input of a failed call is removed; the error message stays.
   - Both run only when `compress` runs, so the prompt cache breaks only alongside a compression.
   - `write` and `edit` are always protected.
4. **Off in subagents** by default.

Its own README is frank about the cost: every pruning changes earlier messages, which invalidates the cached prefix from that point on. DCP's answer is batching, not avoiding it. The repo has no quality evaluation, only token savings.

## Compared
| | Claude Code | Copilot | opencode 2.2.1 | DCP |
|---|---|---|---|---|
| Large tool output | Over 50K characters goes to disk, with a preview in context | Summaries cut tool results to 2,000 characters | Over 2,000 lines or 50 KB goes to a file the model can read | Whatever opencode does |
| Old tool output | Hooks can rewrite a tool result as it is appended (`session.append`) | Dropped when the conversation is summarized | Kept until compaction (V1 had a `prune` step; V2 doesn't) | Placeholders: duplicates, failed-call inputs, compressed ranges |
| Who decides | The engine | The engine | The engine | **The model**, through a tool and nudges |
| Summaries | Whole-conversation compaction, can be computed ahead (`precompute`); subagents compact their own | Background at 80%, inline at 85%, blocking at 95% | Structured compaction; background at 85% (opt-in) | Many small ones, written by the agent mid-task |
| Prompt cache | Sections fixed per session; reminders as attachments | Explicit cache breakpoints | Cache-safe reminders (`instructions.entry`) | Broken at each compression, batched to limit it |
| Extra tools / prompt | None | None | None | One tool and ~1,000 words of prompt |

**The split:** Claude Code, Copilot and opencode keep context management in the engine, and the model never has to think about it. DCP hands it to the model. That suits a large model with a big window, but it's the opposite of what helps a small local model:
- an extra tool, which the harnesses avoid;
- about 1,000 more words on every step;
- a new skill to get right: copying exact message IDs and writing an exhaustive summary mid-task.

## For Tony on the local Qwen model
- **No current failure points at context.** The diagnostic runs average 8 steps and 14 calls, far from a 128k window. Every failure was `incomplete-fix`.
- **Pruning anything now would cost cache hits and buy nothing.** On llama.cpp a cache miss costs prefill time on every later step.
- Worth taking from DCP, in Tony's own code, once a long-context task shows the need (roadmap items 3 and 4):
  1. **Placeholders in the outgoing request, never edits to stored history.**
  2. **Model-free rules first:** drop older outputs of identical calls, and the inputs of old failed calls. Never touch `edit` and `write`.
  3. **Apply them in batches,** only when the context crosses a threshold, so the cached prefix stays stable between batches.
  4. **Reminders pinned to fixed positions,** if we add any.
- Not worth taking for a 30B model: the `compress` tool and the nudges that push the model to use it.
- **To measure, not to guess:** DCP installs as an ordinary opencode plugin, so the eval could run it as a variant next to `baseline` once a long-context task exists. That needs one change: variants that can add plugins, not only Tony options.
