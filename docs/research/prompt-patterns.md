# Prompt patterns from Claude Code (for `tony.prompt`)

Source: `asgeirtj/system_prompts_leaks` @ 2026-10-27, folder `Anthropic/claude-code/` (files for Opus 4.6 → 5.5, Sonnet/Haiku 5.5, and the `agents/` subagent prompts).

**Licensing:** the repo is labelled CC0, but the texts are Anthropic's and some files carry "© Anthropic, All rights reserved". Use them to learn **patterns only**. Tony's prompts are written from scratch; don't paste these texts into Tony.

## What we learned
1. **Size.** The full prompt is ~56k words, but almost all of it is tool documentation. The behaviour part is only ~1.5–2k words. Newer versions (5.x) have *less* behaviour text than 4.6: stronger models need fewer rules. Smaller and local models need more explicit rules.
2. **Structure.** Short sections:
   - Harness: how output renders, denied tools, `<system-reminder>`, hooks, injection.
   - Doing tasks.
   - Acting with care: reversibility and blast radius.
   - Tool use.
   - Tone.
   - Context management.
   - Environment block (cwd, git status, date).
3. **Rules that drive correctness:**
   - "If the user denies a tool call, do not retry the exact same call; adjust."
   - "If you can't verify (e.g. UI), say so explicitly rather than claiming success."
   - Scope discipline: no extra features or abstractions, no speculative error handling, no comments unless the *why* is non-obvious.
   - For exploratory questions, answer in 2–3 sentences with a recommendation; don't implement until agreed.
   - Reversibility and blast radius: free for local, reversible actions; confirm for destructive or shared ones. Approval is scoped, not permanent. Don't bypass checks (`--no-verify`). Investigate unfamiliar state before deleting it.
   - Loop rule (browser section): after 2–3 failed attempts at the same action, stop and ask instead of retrying.
   - Context: "you don't need to wrap up early, compaction will happen"; "when you have enough information, act; don't re-derive or re-litigate".
   - Track multi-step work with the task tool; mark items done as soon as they're done.
   - Parallel independent tool calls.
   - Flag suspected prompt injection in tool results.
4. **Subagent prompts.** `Explore` is a separate, short prompt (~700 words): hard read-only rules spelled out command by command, a "be fast, parallelize" instruction, and a "report as a message, don't create files" rule. Its tool list removes edit/write entirely, rather than relying on the prompt.
5. **Reminders.** Mid-conversation rules arrive as `<system-reminder>` blocks, so the base prompt stays stable and the cache keeps hitting. opencode's equivalent is `instructions.entry`.

## How Tony applies this
- `tony.prompt` replaces opencode's 111-word base prompt with our own ~500-word behaviour prompt written in these patterns, plus tool-specific lines generated from the active tool list (as opencode already does).
- A **local-model addendum** (~150 words): explicit loop rules, "one tool call per need", "answer once you have the data", and short-output guidance. Weaker models need this; frontier models don't.
- The `explore` agent gets the read-only policy through **permissions** (deny edit, shell allowlist) as well as the prompt, as Claude Code does.
