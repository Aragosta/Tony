# Tony

A coding agent app for **macOS and Windows** that makes models, including small local ones, finish tasks correctly and efficiently. Tony is [opencode](https://github.com/anomalyco/opencode)'s desktop app and engine with Tony's brain built in: the same screens, plus the features below, always on. How the pieces fit and how opencode updates come in: [docs/architecture.md](docs/architecture.md).

What Tony adds to plain opencode, kept to the parts with evidence behind them ([docs/research/back-to-basics.md](docs/research/back-to-basics.md)):
- **Completion gate.** opencode treats "the model stopped talking" as done. When the agent stops after changing files, Tony runs the project's checks: `typecheck`, `lint` and `test` scripts, `cargo test`, `go test`, `pytest` or `make test`, detected automatically. If one fails, Tony sends the agent back with the output. An answer that starts with `Blocked:` (something outside the code is missing) is not sent back. Bounded to 3 rounds per request.
- **Loop guard.** The 3rd identical tool call in a row is rejected, and the model gets the earlier result back. The 5th pauses the session so you can steer.
- **A short prompt addition.** About 120 words appended to opencode's own prompt, which stays as is: read before editing, run the project's checks (named), never fake a pass, say `Blocked:` when something is missing. The same text on every request, so the prompt cache keeps working.
- **Local context sync.** Local models are capped at a 128k window, so compaction starts before the server truncates the prompt.

## Get Tony
There are no published downloads yet. CI builds the app for macOS, Windows and Linux on `main` and when started by hand (Actions → CI → Run workflow); the apps are that run's artifacts. To build it yourself (needs [Bun](https://bun.sh) 1.4.4, Node.js 18+ and git):
```bash
git clone https://github.com/Aragosta/Tony && cd Tony && bun install && bun run --cwd packages/desktop build
```
The app lands in `packages/desktop/.build/opencode/packages/desktop/dist/`. The builds are unsigned, so the OS warns on first open:
- **macOS:** open it once, then **System Settings → Privacy & Security → Open Anyway**. Or run `xattr -dr com.apple.quarantine /Applications/Tony.app` once.
- **Windows:** **More info**, then **Run anyway**.

Tony uses your opencode config (`~/.config/opencode/opencode.json`; on Windows `C:\Users\<you>\.config\opencode\opencode.json`) for models, providers and MCP servers. Tony's own defaults (background compaction, step caps, read-only `explore`) win over the same keys in your config or a project's. Tony keeps its own sessions and its own background engine, separate from a plain opencode on the same computer. opencode's phone pairing (remote access) is off in Tony for now. To check Tony is active, ask "What's your name?" It answers "Tony". When the completion gate sends the agent back, you see a `Tony: …` row in the session.

The npm package and `bun run setup` from 1.0.0 are gone; Tony is no longer installed into an existing opencode. If you added the 1.0.0 plugin to your opencode config, remove that entry (`@aragosta/tony` or a path ending in `packages/opencode-plugin`). Otherwise two copies of Tony load and opencode keeps only one, possibly the old one. How the app is put together: [packages/desktop/README.md](packages/desktop/README.md).

## Options
Put Tony's options in `tony.json` next to your opencode config (`~/.config/opencode/tony.json`; on Windows `C:\Users\<you>\.config\opencode\tony.json`). Then restart Tony; it restarts its engine with the new options.
```json
{ "gate": { "checks": ["npm test"] }, "loopGuard": { "blockAt": 4, "stopAt": 6 } }
```
Per feature, your keys win over Tony's defaults (`config/opencode.json`).

| Option | Default | Meaning |
|---|---|---|
| `gate.checks` | auto-detect | Commands the gate runs |
| `gate.maxRounds` | `3` | How many times per request Tony may send the agent back |
| `loopGuard.blockAt` / `stopAt` | `3` / `5` | Identical calls before Tony blocks, then pauses |
| `local.contextLimit` | `131072` | Context window for local providers (`ollama`, `llamacpp`, `lmstudio`, `vllm`, `local`) |
| `prompt.enabled`, `loopGuard.enabled`, `gate.enabled` | `true` | Turn a feature off |

Options from older versions (`editGuard`, `diagnostics`, `tier`, `gate.judge`) are ignored.

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
Merge [`config/local-llamacpp.json`](config/local-llamacpp.json) into your opencode config (`~/.config/opencode/opencode.json`; on Windows `C:\Users\<you>\.config\opencode\opencode.json`) and pick `llamacpp/local` as the model.
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

## Eval
The eval needs [Bun](https://bun.sh) and bash. On Windows, use Git Bash.
```bash
bun packages/eval/src/cli.ts --model llamacpp/local --repeat 3
```
Runs the task suite in `evals/tasks/` with plain opencode and with Tony (this checkout's code), and writes a comparison to `evals/results/`. Compare **false done** (finished but wrong) and **pass rate** between the two. Without a model, `bun packages/eval/test/integration/ab.ts` runs the same comparison with a scripted model (needs `opencode` 2.2.1 on PATH). See `evals/README.md`.

## Develop
Needs [Bun](https://bun.sh) 1.4.4, Node.js 18+ and opencode 2.2.1 (`npm i -g @opencode/cli@2.2.1`) for the integration tests.
```bash
bun test            # unit tests
```
```bash
bun run typecheck   # tsc in every package
```
```bash
TONY_INTEGRATION=1 bun test packages/eval/test/integration   # real opencode 2.2.1 + scripted model
```
```bash
bun run --cwd packages/desktop build   # the Tony app; checks in packages/desktop/README.md
```
Only `packages/opencode-plugin/src/index.ts` imports `@opencode/plugin`. Everything else works through the `Host` interface in `src/host.ts`, so an opencode API change touches one file. OS-specific code lives in `src/platform.ts`. Architecture: `docs/architecture.md`. Research and roadmap: `docs/`.
