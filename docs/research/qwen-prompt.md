# A prompt for Qwen (2026-10-30)

Sources, read from code:
- **Qwen Code** (`QwenLM/qwen-code`, `packages/core/src/core/prompts.ts`). Alibaba's own agent, tuned for Qwen models. The closest reference we have.
- **Copilot Chat** (`microsoft/vscode-copilot-chat`, `src/extension/prompts/node/agent/`). `DefaultAgentPrompt` is what Copilot uses for any model without its own prompt; Qwen has none.
- **Claude Code** (`anthropics/claude-code`). The repo holds only the changelog, docs and plugins; the harness and its system prompt are closed source. The "Opus" and "Fable" prompts on GitHub are unofficial copies of Anthropic's prompts. We don't use them: they're tuned for Claude, they run to thousands of words (too long for a small local model, and paid for on every step), and Tony doesn't paste third-party prompt text.
- **opencode 2.2.1** (`packages/core/src/plugin/optimize.ts`). It has its own prompts for GPT, Claude, Kimi, Trinity and Muse models. Qwen gets the plain 111-word `system.txt`.

## What the references agree on
| Idea | Qwen Code | Copilot default | Claude Code (docs) |
|---|---|---|---|
| Read before editing; never assume file contents | yes | yes | yes, and enforced |
| Do only what was asked; no extra helpers, fallbacks or refactors | yes, in detail | — | yes |
| Run the project's own checks; "NEVER assume standard commands" | yes | — | yes (CLAUDE.md) |
| Report results honestly; never fake a green result | yes | — | yes |
| Call independent tools in parallel; read big chunks | yes | yes | yes |
| Retry a failure only after changing something | yes ("diagnose why") | — | yes |
| "Keep going until resolved, or report the blocker", **as the last line** | yes | yes ("Don't give up…") | — |
| Todos only for multi-step work | yes | — | yes |
| One worked example: read → edit → run checks → short report | yes, per model family | — | — |
| `<system-reminder>` blocks are harness instructions | yes | — | yes |

What's in Qwen Code but not worth copying: sandbox notes, git and commit rules, plan mode, subagent rules, and examples written in Qwen's raw XML tool-call format. With llama.cpp `--jinja`, the chat template already handles that format; prose examples are safer.

## Draft prompt for Qwen
Appended to opencode's base prompt (`system[0]`), not replacing it, so opencode's tool guidance and its `<system-reminder>` line stay. About 170 words. `{checks}` is the detected check command(s), as Tony does today.

```
# Working on code
- Read the files you will change, and their tests, before editing. When you already know several files you need, read them in one turn.
- Change only what was asked, in the style of the surrounding code. Don't add helpers, fallbacks or features nobody asked for.
- If a call fails, read the error and change something before trying again.

# Finishing
- After your last edit, run {checks} once. If it fails, fix the cause. Never edit tests, hard-code expected outputs or remove error checks to make it pass.
- If the task needs something you don't have (a service, credentials, an environment variable), don't fake it. Start your answer with `Blocked:` and name what is missing.
- Answer in a few lines: what you changed and what the checks printed.

# Example
User: the date tests fail, fix it.
You read src/date.ts and test/date.test.ts together, fix the bug with one edit, run the checks once, then answer: "Fixed the month offset in src/date.ts:14. Checks: 12 passed."

Keep going until the request is done, or until you hit a blocker you can name.
```

## Before tuning the prompt further
- **Sampling.** Use the settings on the model card of the exact Qwen model. For Qwen3-Coder that's temperature 0.7, top_p 0.8, top_k 20, repetition_penalty 1.05. Wrong sampling (greedy, or no repetition penalty) causes loops that no prompt fixes.
- **Tool calls.** Qwen3-Coder emits XML tool calls. Run llama-server with `--jinja` and a release that parses them; otherwise calls arrive as text.
- **Measure it.** Compare three setups on the same tasks with 5 repeats each: plain opencode, opencode plus this prompt, and the current Tony prompt. Keep a rule only if removing it makes results worse.
