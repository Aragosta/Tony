# Tony

An agent harness on top of [opencode](https://github.com/anomalyco/opencode) V2 (pinned at **2.2.1**), shipped as one opencode plugin plus a config template. Research and roadmap: `docs/`.

What Phase 1 adds to plain opencode:
- **Loop guard.** The 3rd identical tool call in a row (same tool, same input, no edit in between) is rejected, and the model gets the earlier result back. The 5th pauses the session so you can steer.
- **Tony's system prompt.** It replaces opencode's 111-word default: verify before finishing, stop after repeated failures, ask before destructive actions. Local models get extra rules on top.
- **Local context sync.** Local models are capped at a 128k window, so compaction starts before the server truncates the prompt.
- **Safer defaults.** The todo tool is on, background compaction is on, every agent has a step cap, and `explore` can only run read-only shell commands.

## Completion gate
opencode treats "the model stopped talking" as done. Tony checks the evidence first. When the agent stops after changing files, Tony runs the project's checks (`typecheck`, `lint` and `test` scripts, `cargo test`, `go test`, `pytest` or `make test`, detected automatically). It sends the agent back, in one message, when:
- the checks fail (with the output),
- its last test or build command failed and nothing changed after it,
- it changed existing tests (removed cases or assertions, added `skip`),
- its todo list has open items,
- it ended by announcing a step it didn't take ("Let me run the tests.").

Each reason goes out once, at most `gate.maxRounds` (3) times per request. A check the agent itself already passed after its last change is not run again. You see each nudge as a "Tony: …" row in the session. Edits to files the agent hasn't read, or that changed since, are refused, and new compiler or lint errors are shown right after each edit.

Options: `"gate": { "checks": ["npm test"] }` overrides detection; `"gate": { "judge": true }` adds a reviewer model that compares the work with your request once the checks pass (one extra model call per finished request).

## Install
```bash
git clone <this repo> ~/tony && cd ~/tony && bun install
npm i -g @opencode/cli@2.2.1
export TONY_HOME=~/tony   # add to your shell profile
cp config/opencode.json ~/.config/opencode/opencode.json   # or ./opencode.json in a project
```
To keep subagents cheap, give `explore` a fast model: `"explore": { "model": "<provider>/<model>", ... }`.

Plugin options go under `options` in `config/opencode.json`, for example `{ "loopGuard": { "blockAt": 4, "stopAt": 6 }, "prompt": { "enabled": false }, "local": { "contextLimit": 65536 } }`.

## Local models (128k)
Three numbers must match: the server's context, opencode's `limit.context`, and Tony's `local.contextLimit` (default `131072`).

**llama.cpp (recommended).** Explicit context, explicit chat template, and `/props` shows which template is in use.
```bash
llama-server -m model.gguf --jinja -c 131072 -fa on --cache-type-k q8_0 --cache-type-v q8_0 --port 8080
```
Merge `config/local-llamacpp.json` into your `opencode.json` and run with `--model llamacpp/local`.
- `--jinja` makes llama-server use the model's own chat template and parse tool calls. Without it, many models print tool calls as plain text, which looks like a model narrating a call it never makes.
- A context smaller than the conversation hides earlier tool calls from the model, so it repeats them. Set `-c` to the full 131072.

**Ollama.** opencode 2.2.1 uses the model's *trained* maximum context as its window, but Ollama runs with its own, often much smaller, context. It then silently drops the oldest tokens, including the system prompt and the tool definitions, and the model stops calling tools or loops. Start Ollama with:
```bash
OLLAMA_CONTEXT_LENGTH=131072 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
```
Tony also caps opencode's view of local models at 131072, so compaction starts in time. Pick a model whose `ollama show` lists the `tools` capability.

**128k needs a model trained for it.** If the model's native context is 32k, enable YaRN (`--rope-scaling yarn --rope-scale 4 --yarn-orig-ctx 32768`) or pick a model with native 128k+.

**Memory.** The KV cache grows linearly with context. A `q8_0` cache uses about half the memory of `f16`, and needs flash attention.

## Eval
```bash
bun packages/eval/src/cli.ts --model <provider/model> --repeat 3
```
Runs the task suite in `evals/tasks/` with plain opencode and with Tony, and writes a comparison to `evals/results/`. See `evals/README.md`.

For a local model, start `llama-server` as above, then:
```bash
bun packages/eval/src/cli.ts --model llamacpp/local --repeat 3
```
Compare **false done** (finished but wrong) and **pass rate** between the two variants. Without a model, `bun packages/eval/test/integration/ab.ts` runs the same comparison with a scripted model (needs `opencode` 2.2.1 on PATH).

## Develop
```bash
bun test            # unit tests
bun run typecheck   # tsc in every package
```
Only `packages/opencode-plugin/src/index.ts` imports `@opencode/plugin`. Everything else works through the `Host` interface in `src/host.ts`, so an opencode API change touches one file.
