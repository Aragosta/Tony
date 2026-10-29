# opencode V2: weaknesses and how Tony fixes them

Date: 2026-10-29. Based on reading opencode `main` (v2.2.0) source, compared against Claude Code (docs/changelog), Copilot Chat (source) and the popular plugins (see `plugins-review.md`). Each issue cites where it was found.

## Where opencode is already strong (keep, don't rebuild)
Structured, cache-aware compaction with background precompute; tool-output overflow to files; cache-safe `instructions.entry` reminders; Code Mode tool deferral; resumable background subagents; `/goal` judge loop; tool-input repair; built-in web search (Exa, TinyFish, Firecrawl, Parallel, Tavily); git snapshots/revert; open, typed plugin API. Model-agnostic, which Claude Code is not.

## Issues, ranked by impact on "completes tasks correctly"

### 1. The default prompt for Claude models is almost empty
- **Evidence:** `session/runner/prompt/system.txt` is **111 words**; for Claude models `plugin/optimize.ts` appends a 49-word note about code comments. Nothing on verifying work, using todos, reading before editing, planning, when to delegate, or handling destructive actions. GPT models get a 396–585-word prompt; Kimi/Meta ~1,300 words.
- **Compare:** Claude Code and Copilot (`prompts/node/agent/anthropicPrompts.tsx`) ship long, model-tuned prompts covering todo discipline, verification, safety ("don't use `--no-verify`", confirm irreversible actions) and tool-use policy.
- **Fix (cheapest, biggest win):** `tony.prompt`. Per-model system prompts set via `ctx.agent.transform` (`item.system`) or the `context` hook. Covers: plan → act → verify loop; todos for multi-step work; read before edit; run tests/typecheck before claiming done; report failures honestly; when to use explore subagents; destructive-action policy. Tune against the eval harness.

### 2. No code feedback after edits
- **Evidence:** `tool/plugin/edit.ts:205` and `file-mutation.ts:131`: `// TODO: Add LSP notification and diagnostics after LSP runtime exists.` V1 had this; V2 regressed.
- **Compare:** Copilot appends only *new* diagnostics to each edit result (`editFileToolResult.tsx`). OmO ships LSP/AST tools.
- **Fix:** `tony.diagnostics`. `tool.execute.after` on edit/write/patch, run the language server or `tsc`/`ruff`/`go vet` on the touched files, and append the new errors (capped).

### 3. Edits are not guarded against stale or unread files
- **Evidence:** no read-tracking or mtime check in `tool/plugin/edit.ts` / `file-access.ts`.
- **Compare:** Claude Code rejects edits to files not read this session or modified since they were read.
- **Fix:** `tony.edit-guard`. Record read hashes in `execute.after(read)`, reject in `execute.before(edit|write)` with a clear "re-read the file" message.

### 4. Nothing makes the agent verify before it stops
- **Evidence:** `/goal` is opt-in and judges by reading the transcript, not by running anything. Todo is off by default (`experimental.todo`). Base prompt doesn't ask for verification.
- **Compare:** Claude Code Stop hooks + prompt; Copilot instructions + todo tool used "extensively".
- **Fix:** `tony.verify`. On `experimental.idle`, if files changed, run the project's checks (from AGENTS.md or auto-detect); on failure inject a synthetic message with the output; cap rounds (copy `goal.ts` limits). Enable todo; add a reminder entry when todos are open at idle.

### 5. Old tool output stays in context until a full compaction
- **Evidence:** only images are pruned between compactions (`session/model-request.ts`). The popular fix (DCP) is V1-only and won't load on V2.
- **Compare:** Claude Code clears old tool results; DCP dedups repeated calls and strips errored inputs.
- **Fix:** `tony.context`. In the `context` hook, replace superseded/duplicate/old bulky tool results with a stub + file pointer, recomputed only at batch cut points so the prompt cache survives. Turn on `experimental.background_compaction`.

### 6. Subagents are not cheap and "explore" is not read-only
- **Evidence:** `plugin/agent.ts`: the built-in `explore` agent has no model override (runs on the main, expensive model) and allows `shell: *`, so it can still modify files. The GPT prompts say "Do not spawn subagents unless … explicitly ask".
- **Compare:** Claude Code's Explore and Copilot's `search_subagent` run on fast models with read-only tools and a tool-call limit, and the main agent is told to use them to protect its own context.
- **Fix:** `tony.agents`. Set a fast model on `explore`, restrict shell to a read-only allowlist, and add a "reviewer" subagent for a second pass. Encourage delegation of broad searches in `tony.prompt`.

### 7. No sandbox around shell commands
- **Evidence:** no sandbox code in core (no bubblewrap/seatbelt/landlock); safety is permission rules only, default `ask` for unmatched actions.
- **Compare:** Claude Code runs Bash in an OS sandbox (filesystem/network limits) so it can auto-approve more safely.
- **Fix:** `tony.sandbox`. `ctx.shell.hook("create.before")` wraps commands in bubblewrap (Linux) / sandbox-exec (macOS), or run Tony inside a devcontainer. Lets us allow more without prompts, which keeps long tasks moving.

### 8. V2 is young
- **Evidence:** plugin API marked beta; V1 plugins (DCP, supermemory) don't load; LSP regressed; GitHub Action removed in 2.2.0; breaking changes in each release (CHANGELOG).
- **Fix:** pin the opencode version; keep Tony's plugins behind a thin adapter; upgrade only after the eval suite passes.

### 9. No built-in quality measurement
- **Evidence:** no eval or tracing in core.
- **Fix:** Langfuse/OTel plugin (V2-ready) + Tony eval harness (task suite, success rate, tokens, cache-hit rate, turns). Required to tune 1–6.

### Smaller ones
- Failed edits only get deterministic fuzzy retries. Copilot's LLM "edit healing" could be added later (`execute.after` on edit error).
- No fact-checking of external claims. `tony.factcheck` (see `plugins-review.md`).
- No persistent memory beyond AGENTS.md. Revisit after the eval.

## Build order
1. Pin opencode, add Langfuse, build eval harness.
2. `tony.prompt` (largest effect for least code).
3. `tony.diagnostics` + `tony.edit-guard`.
4. `tony.verify` + enable todo.
5. `tony.agents` (cheap read-only explore, reviewer).
6. `tony.context` + background compaction.
7. `tony.sandbox`, `tony.factcheck`, then edit healing / Headroom / memory by eval data.
