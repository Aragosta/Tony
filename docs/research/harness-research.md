# Tony harness research: opencode as the backbone

Date: 2026-10-29. Sources were read straight from the code, not from blog posts:

| Project | Snapshot read |
|---|---|
| opencode (`anomalyco/opencode`, formerly `sst/opencode`) | `main` @ `726cf09`, V2 **v2.2.0** (2026-10-27) |
| GitHub Copilot Chat (`microsoft/vscode-copilot-chat`) | `main` @ 2026-05-20 |
| Claude Code (`anthropics/claude-code`) | CHANGELOG up to 2.1.312. The harness itself is closed source, so its behaviour comes from the changelog and docs |
| Headroom (`headroomlabs-ai/headroom`) | `main`, including `plugins/opencode` |

Goal: an agent that **finishes tasks correctly** and **manages context well**.

---

## 1. What opencode already does well

opencode V2 already ships many of the things we would otherwise build. Most of its features are internal plugins, built on the same API we get.

### Context management (already strong)
- **Structured compaction** (`packages/core/src/session/compaction.ts`).
  - The summary uses a fixed template: Objective / Requirements / Decisions / Work State (Completed, Active, Blocked) / Next Move / Relevant Files (max 15) / Important Context.
  - It keeps the newest ~15k tokens word for word next to the summary (`keep`).
  - A later compaction *updates* the earlier checkpoint instead of summarizing a summary.
  - It nudges the model once if the summary skips the template.
- **Cache-aware compaction.** The summary request reuses the live prompt prefix, so it reads from the prompt cache.
- **Background (precomputed) compaction.** At 85% of the ceiling, a summary is written in the background and swapped in when compaction is due. Config: `experimental.background_compaction: true`.
- Reserve is 15% of the window, and at least 16k tokens. Config: `compaction.auto | buffer | keep.tokens`.
- **Tool output truncation** (`tool-output.ts`): 2,000 lines / 50 KiB. Overflow goes to a retained file (7 days) that the model can read later.
- **Image pruning** in batches, so the cache prefix stays stable between cuts (`session/model-request.ts`).
- **Keyed session instructions.** `ctx.session.instructions.entry.put` (new in 2.2.0) adds small updates at the next step instead of rewriting the system prompt, so the cache survives. Entries also survive compaction and reverts. This is opencode's equivalent of Claude Code's `<system-reminder>`.
- **Instruction diffing.** When AGENTS.md changes mid-session, only the diff is injected.
- **Configurable prompt-cache TTL**, plus a `warming` plugin that sends keep-alive pings so the cache doesn't expire.

### Task completion (partly there)
- **`/goal` plugin** (`plugin/goal.ts`). A judge model runs a stop-hook-style loop: verdicts are `done | continue | blocked | paused | wait`. Limits: max 50 rounds, 3 stalls, 30 min wait.
- **`experimental.idle` hook.** Runs when the session is about to go idle. A plugin can inject a synthetic message ("run the tests") and the session keeps going. This is the hook we need for verification loops.
- **Subagents**: background-capable, resumable by sessionID, model override.
- **Plan agent**: read-only, with edits allowed only in `~/.opencode/plan`.
- **`todowrite` tool**: opt-in via `{ "experimental": { "todo": true } }`.
- **Tool input repair** (`plugin/tool-input-repair.ts`): fixes stringified JSON, `"20"` → `20`, nulls and similar.
- **Edit tool fallbacks**: if there's no exact match, it retries ignoring typographic quote/dash/space differences, then trailing whitespace.
- **Per-model system prompts** (`plugin/optimize.ts`, `plugin/system-prompt/*.txt` for anthropic, gpt, kimi, …).
- **Code Mode**: MCP and extra tools are called as JS inside one `execute` tool, with a `search()` for tools not listed. This is how opencode defers tools (like Claude Code's ToolSearch and Copilot's `tool_search`).

### Gaps found in opencode V2
1. **No LSP diagnostics after edits.** `tool/plugin/edit.ts:205` and `file-mutation.ts:131` both say `// TODO: Add LSP notification and diagnostics after LSP runtime exists.` (V1 had this. V2 lost it.)
2. **No read-before-edit or stale-file guard.** The edit tool doesn't check that the model read the file, or that the file is unchanged since it was read.
3. **No clearing of old tool results.** Only images are pruned. Old grep/read/shell outputs stay in context until a full compaction.
4. **No LLM "edit healing".** Only the deterministic fuzzy fallback exists.
5. Todo is off by default. Background compaction is off by default.

---

## 2. Plugin system (how we extend it)

The V2 API (`@opencode/plugin` 2.2.0, `packages/plugin/src/promise/`) is labelled **beta**: names and shapes can still change. **Pin the opencode version** and keep our plugins behind a thin adapter.

```ts
import { Plugin } from "@opencode/plugin"
export default Plugin.define({
  id: "tony.verify",
  setup: async (ctx) => { /* register hooks; may return cleanup */ },
})
```
Config: `"plugins": [{ "package": "...", "options": {...} }]` in `opencode.json`. Official plugins install from Git URLs.

| Extension point | What it lets us do |
|---|---|
| `ctx.session.hook("context")` | Change system, messages, tools and options right before each model call (e.g. clear stale tool results, rewrite tool descriptions) |
| `ctx.session.hook("prompt")` | Rewrite or annotate user prompts (like UserPromptSubmit) |
| `ctx.session.hook("compaction")` | Replace the summary or supply our own (`event.result`) (like PreCompact) |
| `ctx.session.hook("experimental.idle")` | Stop hook: inject follow-up work before going idle |
| `ctx.session.hook("retry")`, `model.request`, `http.request/response` | Transport control (this is how Headroom plugs in) |
| `ctx.tool.hook("execute.before" / "execute.after")` | Pre/PostToolUse: block, rewrite input, append to results |
| `ctx.tool.transform` | Add, remove or replace tools |
| `ctx.agent.transform` | Define agents (mode `primary`/`subagent`, permissions, model) |
| `ctx.permission.hook("evaluate")` | Custom allow/deny/ask policy |
| `ctx.shell.hook("create.before")` | Inject env vars, wrap shell commands |
| `ctx.session.instructions.entry.put/remove` | Cache-safe reminders |
| `ctx.session.synthetic`, `generate`, `compact` | Drive the loop from a plugin; side-model calls |
| `ctx.storage`, `ctx.rpc`, `ctx.event.subscribe` | State, UI/RPC, events |
| `ctx.skill/mcp/command/model/provider.transform` | Skills, MCP servers, slash commands, model policy |

Note: the many V1 guides online use `tool.execute.before` / `experimental.session.compacting` hook names. Those are the **V1** API. V2 still loads V1 plugins (Headroom ships both entry points), but new work should target V2.

---

## 3. What to take from Claude Code and Copilot

| Technique | Who does it | Status in opencode | Plan |
|---|---|---|---|
| Diagnostics appended to edit results (only *new* errors) | Copilot (`editFileToolResult.tsx`) | Missing (TODO) | **Build**: `execute.after` on edit/write/patch → run LSP/tsc/linter for the touched files → append new diagnostics |
| Read-before-edit and "file changed since read" guard | Claude Code | Missing | **Build**: track reads in `execute.after(read)`, reject in `execute.before(edit)` |
| Clearing old tool results (microcompact / context editing) | Claude Code | Images only | **Build**: in the `context` hook, replace old bulky tool outputs with a stub plus a pointer to the saved file. Clear in batches (as opencode does for images) to keep the cache |
| Verification before "done" | Claude Code (Stop hooks), Copilot instructions | `/goal` + `experimental.idle` | **Build**: a verify plugin that runs project checks on idle and feeds failures back. Bound the loop |
| Todo list with reminders | Both (`TodoWrite`, `manage_todo_list`) | Opt-in | **Configure**: enable. Add a reminder via `instructions.entry` when todos go stale |
| Read-only search/explore subagent on a cheap model | Copilot `search_subagent`, Claude Code `Explore` | Built-in `explore` agent exists, but uses the main model and allows `shell: *` | **Configure**: `agent.transform` → give `explore` a fast model and restrict its shell to read-only commands |
| Background summarization | Copilot (`backgroundSummarizer.ts`) | Exists | **Configure**: `experimental.background_compaction: true` |
| Idle compaction before the cache TTL expires | Claude Code | `warming` keeps the cache alive instead | **Configure**: `warming`. Consider idle-compaction for long sessions |
| LLM edit healing (fix a failed `oldString` with a side model) | Copilot (`editFileHealing.tsx`) | Fuzzy fallback only | **Later**: `execute.after` on edit error → `ctx.generate` corrected snippet → retry once |
| Deferred tool loading | Claude Code ToolSearch, Copilot `tool_search` | Code Mode `search()` | Already covered |
| Per-model prompts | Copilot (anthropic/gemini/openai/xAI prompt files) | Exists | Tune ours through the `context` hook |
| Persistent memory | Copilot `memory` tool, Claude Code MEMORY.md | AGENTS.md instructions | **Later**: small memory tool plus instruction entry |
| Safety: confirm hard-to-reverse actions, no `--no-verify` | Both | Permission rules | **Configure**: permission policy plugin |

---

## 4. Headroom

- **What it does:** compresses tool outputs, logs and JSON before they reach the LLM. It routes by content type: SmartCrusher for JSON, AST-aware compression for code, a small text model for prose. Compression is reversible: originals are cached locally and the model gets them back with `headroom_retrieve`.
- **Claimed savings** (the project's own benchmarks): ~20% on coding-agent traces, 60–95% on repetitive JSON. Little gain on prose or short chats.
- **Cache-aware:** it compresses only the "live zone" (new tool output, latest turn), so the cached prefix stays byte-identical.
- **opencode integration:** `headroom wrap opencode`, or the `headroom-opencode` plugin (V1 + V2 entry points).
- **Caveats:**
  - It needs the **Python proxy** running (`pip install "headroom-ai[all]"`).
  - On opencode 2.x the native plugin only redirects models that use the **OpenAI chat/responses** formats. Anthropic and Google formats are left alone unless you use `headroom wrap`.
  - Its anonymous telemetry beacon is on by default. Turn it off with `HEADROOM_BEACON=off`.
  - It overlaps with opencode's own truncation and with our planned tool-result clearing.
- **Recommendation:** make it an **optional layer, not a dependency**. Measure on our own tasks, with A/B runs comparing tokens *and* task success. Our own cache-safe tool-result clearing covers most of the gain without a second runtime.

---

## 5. Proposed architecture

```
opencode V2 (pinned)                          ← loop, tools, compaction, subagents, Code Mode, sessions
 └─ opencode.json                             ← config-only wins (step 0)
 └─ tony plugins (@opencode/plugin, V2)
     ├─ tony.diagnostics   execute.after      ← LSP/tsc/lint feedback on edits
     ├─ tony.edit-guard    execute.before     ← read-before-edit, stale-file check
     ├─ tony.context       session "context"  ← cache-safe clearing of old tool results, budget telemetry
     ├─ tony.verify        experimental.idle  ← run checks before finishing, bounded retries
     ├─ tony.reminders     instructions.entry ← todo/plan nudges without busting the cache
     ├─ tony.agents        agent.transform    ← explore (read-only, fast model), reviewer
     └─ (optional) headroom-opencode          ← compression, behind a flag
 └─ eval harness                              ← fixed task set; measure success, tokens, cache-hit, turns
```

### Suggested order
0. **Config only:** enable todo and background compaction, set `warming`, give the built-in `explore` agent a fast model and read-only shell, write the permission policy. No code.
1. **Eval harness first:** a fixed task set (a repo plus tests that must pass), scored on success rate, total and cached tokens, and steps. Without it, nobody can tell whether a plugin actually helps.
2. `tony.diagnostics` and `tony.edit-guard`. These have the biggest effect on correctness and are small.
3. `tony.verify`, built on `experimental.idle`, modelled on `plugin/goal.ts`.
4. `tony.context`: tool-result clearing. Check cache-hit rate with the eval harness.
5. Headroom A/B, edit healing, memory.

### Risks
- The V2 plugin API is beta. Pin versions and keep an adapter layer.
- Hooks that rewrite earlier messages break the prompt cache. Every change to history should happen in batches at a stable cut point.
- An idle/verify loop that always injects input never ends. Bound it with round and stall caps, as `goal.ts` does.

---

## Notes
- In this session `opencode.ai` and `code.visualstudio.com` couldn't be reached (network policy), so the official docs pages and the VS Code "Coding Harness Behind GitHub Copilot" post (2026-05-15) weren't read directly. The source repos were used instead.
- Claude Code's internals are closed source. The Claude Code rows describe its documented, user-visible behaviour.

---

## 2026-10-30 addendum: what the first local-model eval taught us
Sources read from code: `microsoft/vscode-copilot-chat` @ `5863f5a`; `anthropics/claude-plugins-official` (the plugins moved there from `anthropics/claude-code`) and the Claude Code docs; `openai/codex` prompt files. Claude Code's own prompt and reminder code are closed source; those points come from its docs and changelog.

**What the eval showed (llama.cpp model):**
- When the task was impossible (missing `STATUS_URL`), the model faked success: it stubbed `fetch` in the test, and would otherwise hard-code a fallback.
- It guessed a test runner (`npx tsx` on a bun test).
- It took extra verification steps.

| Finding | Who | What Tony does |
|---|---|---|
| The model never picks a test runner: Copilot has a `runTests` tool and lists tasks in `<workspace_info>`; Codex and Claude Code put the test command in AGENTS.md / CLAUDE.md | Copilot, Codex, Claude Code | The prompt names the project's checks (`# This project`), detected once per session |
| Copilot's autopilot has no "blocked" exit and pushes models on. Its GPT-4.1 prompt even says to create a `.env` with a placeholder | Copilot | Not copied |
| Prompt Stop hooks can answer `impossible: true`, which lets the stop through | Claude Code | A `Blocked:` answer ends the gate as `needs-user` without nudging about the failures it reports |
| "Do not hard-code values or create solutions that only work for specific test inputs… if infeasible, inform me" | Anthropic prompting guide | Anti-faking rules in the core prompt, in Tony's own words |
| "never test mock behavior"; approval needed for any test-assertion edit | Copilot | The gate flags mocks or stubs added to tests, and literal defaults added for env settings in source |
| Specific test first, then broader, then stop. Don't re-read after a successful edit | Codex, Copilot | Small-tier prompt rules |
| Nudge: "Do not repeat your previous response. Pick up where you left off." | Copilot | Gate footer |
| Per-turn `<reminderInstructions>` and the todo list placed next to the latest message | Copilot | Next: reminders via `instructions.entry` (roadmap row 12) |

**Structure.** Tony now has a general core (`src/core`) and model tiers (`src/tiers`: `small`, `frontier`). See `docs/architecture.md`.

### Run 2 (2026-10-30, 2 repeats): Tony got slower, and why
Tony matched baseline at 12/14 passes but took 7.1 steps against 5.3. The gate fired 0.1 rounds per run, so it wasn't the cause. The tool traces point at Tony's own prompt and tools:

| What the trace showed | Cause in Tony | What Claude Code, Copilot and Codex do | Change |
|---|---|---|---|
| Fewer calls per turn (about 1.4 vs 1.7) | Small tier: "Make one tool call per need" | All three push independent read-only calls into one turn | Batching is now in the core prompt for every tier |
| `todowrite` 3× on a three-part task | `experimental.todo` on, with guidance at 3+ steps | Claude Code and Codex skip todos for simple tasks; opencode leaves todo out for non-Claude models | Guidance: only at 4+ steps across several files |
| `npm run test` 3×, edit→test→edit→test | "Verify in this order: the specific test, then the full checks" | Claude Code runs the project's command; Copilot fixes only new errors, at most 3 rounds | "Run the checks once after your last change" |
| `if (!url) throw …` became `return "ok"`, and the gate said verified | The fallback detector knew only env defaults | — | A drop in `throw`/`raise`/`process.exit(`/`panic!(` in a source file is a finding |

The prompt went from about 730 words to at most 450 (a test enforces the cap).

Checked in the opencode 2.2.1 binary: it neither refuses edits to unread files nor appends diagnostics to edits. So Tony's edit guard and its diagnostics are not duplicates, and both stay. (opencode 1.x did both.)
