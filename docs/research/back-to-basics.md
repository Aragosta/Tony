# Back to basics: what Tony keeps (2026-10-30)

Goal: a smart harness that makes the model's work better, is fast and efficient, and makes tool use reliable. Rule from now on: **a feature stays only if the eval shows it helps.**

Sources:
- **Claude Code**: `anthropics/claude-code`. The engine's binary is closed, but the repo holds `mods/`: the source of the 4 plugins built into Claude Code, and `mods/types/claude-code.d.ts`, 13,440 lines of the engine's hook API. That file documents every engine event: how the prompt is put together, reminders, tools, compaction, the turn loop. Also used: the CHANGELOG, for when features shipped.
- **Copilot Chat**: `microsoft/vscode-copilot-chat`, read from its source (`src/extension/intents/node/`, `prompts/node/agent/`, `tools/common/`).
- **opencode 2.2.1**: read from its source (`packages/core/src/plugin`, `session/`).

## Claude Code: top 5 (from `mods/types/claude-code.d.ts`)
1. **The prompt is built to stay cached.**
   - The system prompt is a list of named sections (`intro`, `tools`, `memory`, `env_info_simple`, …).
   - Each section is computed once and cached for the session. In the types' words: "an unstable answer spends the model's prompt cache on every call" (`prompt.section`, `prompt.compose`).
   - Project context (CLAUDE.md, environment) goes into the first user message, once per conversation. It is computed again only after compaction or `/clear` (`prompt.context`).
2. **Changing state travels as reminders, not prompt edits.**
   - The engine injects short `<system-reminder>` messages into the request (`prompt.attachment`).
   - The types name these kinds: `todo_reminder`, `plan_mode`/`plan_mode_exit`, `auto_mode`, `nested_memory` (a subfolder's CLAUDE.md/AGENTS.md, attached when the model reads a file there), `edited_text_file` (a file changed outside the agent), `deferred_tools_delta`, `skill_listing`, `file`, `queued_command`.
   - The system prompt itself stays fixed.
3. **The tool list is stable and small.**
   - Each tool's description is computed once per session and cached.
   - Tools marked `isDeferred` sit behind ToolSearch, so their schemas aren't sent until needed (`tool.describe`).
   - Every call passes one chain before it runs: hooks, then permission rules and mode, then the tool's own check (`tool.call` → `tool.check`).
   - Read-before-edit exists, but was relaxed because it cost calls: a `grep`, `head` or `tail` of a file now counts as a read (CHANGELOG lines 5603, 5908).
4. **Compaction.**
   - Four triggers: `manual`, `auto`, `plugin` and `precompute`, which computes the summary in the background ahead of time (`session.compact`).
   - The summary is stored as a message.
   - If the reply has no summary, it is asked for again.
   - Subagents compact their own transcripts.
   - CLAUDE.md and the skill list are sent again after compaction.
5. **The turn loop and completion.**
   - Hooks at the start of a turn, on each streamed step, and when the turn completes.
   - Stop hooks can refuse the stop and say why.
   - `/goal` keeps working across turns until a stated condition is met (2.1.139).
   - Side calls for checks and classifiers: `model.fork` reuses the conversation's cached prefix, `model.classify` sorts a text into labels.
   - Subagents (`agent.spawn`) run with their own transcripts, so the parent's context stays small.

## Copilot: top 5
1. **A prompt per model** (`promptRegistry.ts`): separate prompts for Anthropic, GPT, Gemini, xAI, ZAI and MiniMax models, plus `DefaultAgentPrompt` for everything else (Qwen gets this one). Per-model reminder instructions go into the latest user message.
2. **Context.** It summarizes the conversation in the background. It starts at 80% of the window and blocks at 95%, so the model rarely waits (`agentIntent.ts:452-775`). The message budget is 90% of the window minus the tool schemas. It also sets prompt-cache breakpoints (`cacheBreakpoints.ts`).
3. **Autopilot completion.**
   - The model must call a `task_complete` tool to finish.
   - Without that call, it gets nudged at most 5 times, with 3 retries (`toolCallingLoop.ts:350`).
4. **Tool use.**
   - Rarely used tools are deferred behind `tool_search`, and large toolsets are grouped into virtual tools.
   - Edit-tool learning: per model, it prefers the edit tool that has succeeded most often (`editToolLearningService.ts`).
   - `replace_string` and `multi_replace_string` handle edits.
   - Edit results show only new diagnostics.
5. **Subagents that keep context small.** A search subagent, and an execution subagent that runs commands and returns only the relevant output.

## What both harnesses agree on
1. **Keep the cached prefix stable.** Compute the system prompt and the tool list once and never change them mid-session. In opencode, Tony's prompt addition must be byte-identical on every request.
2. **Put changing state in short reminders near the latest message**, not in the system prompt. Claude Code uses attachments; Copilot uses reminder instructions. opencode's equivalent is `instructions.entry`.
3. **Send a small, stable tool list.** Defer rarely used tools. Never add a tool the model doesn't need: Tony's `todowrite` cost calls.
4. **Compact in the background before the window is full.** Claude Code computes ahead (`precompute`); Copilot starts at 80%. opencode does it at 85% with `background_compaction`.
5. **Stop on evidence, with a bound.** Stop hooks and `/goal` in Claude Code, `task_complete` with at most 5 nudges in Copilot. Tony's gate: checks after the last change, at most 3 rounds.

## What worked for Tony, and what didn't
| Rule | Evidence (scripted = the fake model in `packages/eval/test/integration`, which proves a mechanism works, not that it helps a real model) | Verdict |
|---|---|---|
| **Loop guard** (block the 3rd identical call, pause at the 5th) | Scripted only: 95 identical calls became 5 | **Keep** |
| **Gate: checks fail → send the output back** | Scripted A/B only: hidden-break went from false done to pass. Real model: 0.1 rounds per run, so rarely needed | **Keep, this rule only** |
| **Name the project's check command** in the prompt | Run 1: the model guessed `npx tsx` on a bun project | **Keep** |
| **`Blocked:` exit** (say what's missing instead of faking it) | Run 1: the model faked success on report-failure | **Keep** (one prompt line, plus the gate doesn't nudge a blocked answer) |
| **Local 128k context cap** | Mechanism only: fixes silent truncation by the server; no eval task reaches it | **Keep** |
| Replace opencode's prompt | Lost opencode's per-model prompts and its `<system-reminder>` line; +34% steps (5.3 → 7.1) | **Remove**: add to the base prompt instead |
| Edit guard | Costs refusal + read + retry; caused the false `verified` bug | **Remove** (maybe return later as changed-since-read only, measured) |
| Diagnostics after edits | Never ran in the eval (no tsc in the fixtures); runs whole-project `tsc` twice per edit | **Remove** |
| `experimental.todo` | `todowrite` 3× on a three-part task | **Remove** |
| Tamper, fallback, removed-`throw` and "announced step" detectors | Each written from one trace; false alarms likely | **Remove** |
| Open-todo and failed-last-command nudges | No measured effect | **Remove** |
| Judge | Never measured | **Remove** |
| Check reuse | Saves one test run per finish, but adds a lot of complex code | **Remove for now**; measure the cost of the extra run first |
| Model tiers (`small`, `frontier`) | The tier prompts are what made runs slower | **Remove**; keep the local context cap as plain core code |

## Context management
opencode already has the strong pieces, so Tony doesn't rebuild them:
- structured compaction that updates the earlier summary instead of summarizing a summary;
- background compaction at 85% (`experimental.background_compaction`; Copilot does the same at 80%);
- tool output over 2,000 lines or 50 KB goes to a file the model can read;
- cache-safe reminders (`instructions.entry`).

For a local Qwen model at 128k, what matters, in order:
1. **The right window.** Kept: the local cap.
2. **Prompt-cache reuse.** llama.cpp only reuses the cached prefix while earlier messages stay the same. Tony's prompt addition must be the same on every request, and Tony must never edit earlier messages.
3. **Clearing stale tool output** in batches. Neither opencode nor Tony does this today. It's the next candidate, but no current eval task is long enough to show an effect. Add a long task first.

## Goal completion
- Keep the cheap evidence check: when files changed, run the checks, and send failures back. A correct finish costs no extra model call.
- For long autonomous work, use opencode's own `/goal` (a judge loop with round and stall limits) instead of building a second one.
- Copilot's `task_complete` tool stays an experiment. An extra tool costs small models.

## Tool use for Qwen
- llama-server `--jinja`, and a release that parses Qwen3-Coder's XML tool calls.
- Use the sampling settings on the model card.
- Keep opencode's tool guidance, which the prompt addition keeps.
- opencode already repairs tool input and retries edits with fuzzy matching.
- Candidates to measure later: a changed-since-read edit guard, and trimming command output (like Copilot's execution subagent).

## The minimal Tony
| Piece | Where |
|---|---|
| Loop guard | `core/loop/` (unchanged) |
| Local context cap | `core/context/local.ts` (moved from `tiers/small`) |
| Prompt addition | `core/prompt/`: appended to `system[0]`, ≤150 words |
| Gate: checks fail → send back; `Blocked:` → stop | `core/gate/` (cut down) |
| Config | step caps, read-only `explore`, background compaction; no `experimental.todo` |

Every later feature comes back only as an option that is off by default, and only after the eval runs it as its own variant.
