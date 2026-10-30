# Changelog

## Unreleased
- **Back to basics.** Tony keeps the four rules with evidence behind them: the loop guard, the local context cap, a completion gate that sends failing checks back (and stops on `Blocked:`), and a short prompt addition. Removed, because they cost steps or were never shown to help ([docs/research/back-to-basics.md](docs/research/back-to-basics.md)):
  - Tony's replacement system prompt and the model tiers: opencode's own prompt is kept and Tony appends ~120 words. The replacement cost +34% steps.
  - The edit guard: each refusal cost a read and a retry.
  - Diagnostics after edits: ran whole-project `tsc` twice per edit, never exercised by the eval.
  - The judge, and the gate's tamper, fallback, removed-`throw`, failed-last-command, open-todo and announced-step reasons: each was written from one trace, without a measured effect.
  - Check reuse, and the `todo` tool in the default config.
  - Old `tony.json` keys for these are ignored.
- **Tony is an app now.** Tony ships as opencode's desktop app with Tony's brain built in, instead of a plugin you add to opencode. The npm package `@aragosta/tony`, `bun run setup` and the per-OS plugin install steps are removed. The brain and all its features are unchanged.
- Tony's options now go in `tony.json` next to your opencode config. If you added the 1.0.0 plugin to your opencode config, remove that entry.
- Tony runs its own background engine, with its own sessions. opencode's phone pairing is off in Tony for now.

## 1.0.0 (2026-10-29)
First release, for opencode 2.2.1, on Windows, macOS and Linux. Install: add `"plugins": [{ "package": "@aragosta/tony@1.0.0" }]` to your opencode config.

- **Completion gate.** When the agent stops after changing files, Tony runs the project's checks and sends the agent back, with the reason, when:
  - checks fail;
  - the last test or build command failed;
  - an edit was refused and never redone;
  - tests were weakened;
  - todos are open;
  - a step was announced but not taken.

  Bounded to 3 rounds per request. An optional reviewer model (`gate.judge`) compares the work with the request.
- **Loop guard.** Blocks the 3rd identical tool call in a row and pauses at the 5th.
- **Edit guard.** Refuses edits to unread or changed files.
- **Diagnostics.** New tsc, ruff or go vet errors after each edit.
- **System prompt.** Tony's own prompt, with extra rules for local models.
- **Local context.** Local providers are capped at a 128k window, so compaction starts before the server truncates.

Known limits:
- The gate can't tell a failure the agent caused from one that was already there; the agent is told it may report rather than fix such a failure.
- On large TypeScript projects, the after-edit `tsc` run can time out (20 s), which turns diagnostics off for that session.
