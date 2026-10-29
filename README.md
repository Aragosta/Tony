# Tony

An [opencode](https://github.com/anomalyco/opencode) plugin that makes coding agents finish tasks correctly and efficiently, including small local models. It installs from npm as **`@aragosta/tony`** and works on **Windows, macOS and Linux**.

What Tony adds to plain opencode:
- **Completion gate.** opencode treats "the model stopped talking" as done; Tony checks the evidence first. When the agent stops after changing files, Tony runs the project's checks: `typecheck`, `lint` and `test` scripts, `cargo test`, `go test`, `pytest` or `make test`, detected automatically. It sends the agent back, with the reason, when:
  - a check fails;
  - its last test or build command failed;
  - an edit was refused and never redone;
  - it weakened existing tests;
  - todos are still open;
  - it ended by announcing a step it didn't take.

  Bounded to 3 rounds per request. A check the agent already passed as its latest action isn't run twice.
- **Loop guard.** The 3rd identical tool call in a row is rejected, and the model gets the earlier result back. The 5th pauses the session so you can steer.
- **Edit guard.** Edits to files the agent hasn't read, or that changed since, are refused.
- **Diagnostics.** New compiler or lint errors (tsc, ruff, go vet) are shown right after each edit.
- **Tony's system prompt.** Replaces opencode's 111-word default: verify before finishing, check every part of the request, stop after repeated failures, ask before destructive actions. Local models get extra rules.
- **Local context sync.** Local models are capped at a 128k window, so compaction starts before the server truncates the prompt.

## Install (Windows and macOS)
**1. Install opencode 2.2.1.** This needs [Node.js](https://nodejs.org) 18 or newer.
```bash
npm i -g @opencode/cli@2.2.1
```

**2. Add Tony to your global opencode config.** Create the file if it doesn't exist.

| OS | Config file |
|---|---|
| macOS / Linux | `~/.config/opencode/opencode.json` |
| Windows | `C:\Users\<you>\.config\opencode\opencode.json` |

The minimal config:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{ "package": "@aragosta/tony@1.0.0" }]
}
```
The recommended config is [`config/opencode.json`](config/opencode.json): Tony, the todo list, background compaction, step caps, and a read-only `explore` subagent. Copy it into that file, or merge it if you already have one. opencode downloads Tony on the next start.

**3. Use opencode as usual.** In any project:
```bash
opencode
```
To check Tony is active, ask "What's your name?" It answers "Tony". When the completion gate sends the agent back, you see a `Tony: …` row in the session.

**Update:** change the version in the `package` line, for example `@aragosta/tony@1.0.1`. **Turn off:** remove the line.

## Options
Put options next to the package:
```json
{ "package": "@aragosta/tony@1.0.0", "options": { "gate": { "checks": ["npm test"] }, "loopGuard": { "blockAt": 4, "stopAt": 6 } } }
```

| Option | Default | Meaning |
|---|---|---|
| `gate.checks` | auto-detect | Commands the gate runs |
| `gate.maxRounds` | `3` | How many times per request Tony may send the agent back |
| `gate.judge` | `false` | Adds a reviewer model call that compares the work with your request once the checks pass |
| `loopGuard.blockAt` / `stopAt` | `3` / `5` | Identical calls before Tony blocks, then pauses |
| `local.contextLimit` | `131072` | Context window for local providers (`ollama`, `llamacpp`, `lmstudio`, `vllm`, `local`) |
| `prompt.enabled`, `editGuard.enabled`, `diagnostics.enabled`, `gate.enabled` | `true` | Turn a feature off |

To keep subagents cheap, give `explore` a fast model in the config: `"explore": { "model": "<provider>/<model>", ... }`.

## Local models (128k)
Three numbers must match: the server's context, opencode's `limit.context`, and Tony's `local.contextLimit` (default `131072`).

**llama.cpp (recommended).** It gives an explicit context and an explicit chat template, and `/props` shows which template is in use.
- **macOS:** `brew install llama.cpp`.
- **Windows:** download a release from [github.com/ggml-org/llama.cpp/releases](https://github.com/ggml-org/llama.cpp/releases) and use `llama-server.exe`.

Then, with the same flags on both:
```bash
llama-server -m model.gguf --jinja -c 131072 -fa on --cache-type-k q8_0 --cache-type-v q8_0 --port 8080
```
Merge [`config/local-llamacpp.json`](config/local-llamacpp.json) into your `opencode.json` and run `opencode --model llamacpp/local`.
- `--jinja` makes llama-server use the model's own chat template and parse tool calls. Without it, many models print tool calls as plain text, which looks like a model narrating a call it never makes.
- A context smaller than the conversation hides earlier tool calls from the model, so it repeats them. Set `-c` to the full 131072.

**Ollama.** opencode 2.2.1 uses the model's *trained* maximum context as its window, but Ollama runs with its own, often much smaller, context. It then silently drops the oldest tokens, including the system prompt and the tool definitions, and the model stops calling tools or loops. Set Ollama's context, then quit and restart Ollama:
- **macOS (Ollama app):**
  ```bash
  launchctl setenv OLLAMA_CONTEXT_LENGTH 131072
  ```
  ```bash
  launchctl setenv OLLAMA_FLASH_ATTENTION 1
  ```
  ```bash
  launchctl setenv OLLAMA_KV_CACHE_TYPE q8_0
  ```
- **Windows (PowerShell):**
  ```powershell
  setx OLLAMA_CONTEXT_LENGTH 131072; setx OLLAMA_FLASH_ATTENTION 1; setx OLLAMA_KV_CACHE_TYPE q8_0
  ```
- **Linux / a terminal:**
  ```bash
  OLLAMA_CONTEXT_LENGTH=131072 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
  ```

Pick a model whose `ollama show` lists the `tools` capability.

**128k needs a model trained for it.** If the model's native context is 32k, enable YaRN (`--rope-scaling yarn --rope-scale 4 --yarn-orig-ctx 32768`) or pick a model with native 128k+.

**Memory.** The KV cache grows linearly with context. A `q8_0` cache uses about half the memory of `f16`, and needs flash attention.

## Run from source
For development, or to try unreleased changes:
```bash
git clone https://github.com/Aragosta/Tony && cd Tony && bun install
```
Then point the config at your checkout with an absolute path, for example `"package": "/Users/you/Tony/packages/opencode-plugin"` or `"package": "C:\\Users\\you\\Tony\\packages\\opencode-plugin"`.

## Eval
The eval needs [Bun](https://bun.sh) and bash. On Windows, use Git Bash.
```bash
bun packages/eval/src/cli.ts --model llamacpp/local --repeat 3
```
Runs the task suite in `evals/tasks/` with plain opencode and with Tony (this checkout's code), and writes a comparison to `evals/results/`. Compare **false done** (finished but wrong) and **pass rate** between the two. Without a model, `bun packages/eval/test/integration/ab.ts` runs the same comparison with a scripted model (needs `opencode` 2.2.1 on PATH). See `evals/README.md`.

## Develop
```bash
bun test            # unit tests
```
```bash
bun run typecheck   # tsc in every package
```
```bash
TONY_INTEGRATION=1 bun test packages/eval/test/integration   # real opencode 2.2.1 + scripted model
```
Only `packages/opencode-plugin/src/index.ts` imports `@opencode/plugin`. Everything else works through the `Host` interface in `src/host.ts`, so an opencode API change touches one file. OS-specific code lives in `src/platform.ts`. Releasing: `docs/publishing.md`. Research and roadmap: `docs/`.
