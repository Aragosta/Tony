# Tony

An [opencode](https://github.com/anomalyco/opencode) plugin that makes coding agents finish tasks correctly, including small local models.

- **Completion gate.** When the agent says it's done, Tony runs your project's checks and sends it back, with the concrete reason, if:
  - a check fails,
  - an edit was refused,
  - it weakened a test,
  - it left todos open,
  - or it announced a step it never took.
- **Loop guard.** Stops repeated identical tool calls.
- **Edit guard.** Refuses edits to files the agent hasn't read, or that changed since.
- **Diagnostics.** New compiler and lint errors appear right after each edit.
- **System prompt.** Tony's own prompt replaces opencode's minimal default, with extra rules for local models.

Requires opencode **2.2.1** (`npm i -g @opencode/cli@2.2.1`). Works on Windows, macOS and Linux.

## Install
Add Tony to your global opencode config. opencode downloads it on the next start.
- **macOS / Linux:** `~/.config/opencode/opencode.json`
- **Windows:** `C:\Users\<you>\.config\opencode\opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{ "package": "@aragosta/tony@1.0.0" }]
}
```

To check it's active, ask the agent "What's your name?" It answers "Tony".

The recommended full config (todo list, background compaction, step caps, read-only `explore`) is in [config/opencode.json](https://github.com/Aragosta/Tony/blob/main/config/opencode.json).

## Options
Put options next to the package:
```json
{ "package": "@aragosta/tony@1.0.0", "options": { "gate": { "checks": ["npm test"] } } }
```

| Option | Default | Meaning |
|---|---|---|
| `gate.checks` | auto-detect | Commands the gate runs. Auto-detection covers `typecheck`/`lint`/`test` scripts, `cargo test`, `go test`, `pytest` and `make test`. |
| `gate.maxRounds` | `3` | How many times per request Tony may send the agent back. |
| `gate.judge` | `false` | Adds a reviewer model call that compares the work with your request. |
| `loopGuard.blockAt` / `stopAt` | `3` / `5` | Identical calls before Tony blocks, then pauses. |
| `local.contextLimit` | `131072` | Context window assumed for local models (`ollama`, `llamacpp`, `lmstudio`, `vllm`). |
| `prompt.enabled`, `editGuard.enabled`, `diagnostics.enabled`, `gate.enabled` | `true` | Turn a feature off. |

Local-model setup, the eval and development: see the [repository](https://github.com/Aragosta/Tony).
