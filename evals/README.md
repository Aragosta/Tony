# Tony evals

A fixed task suite run through `opencode run`, scored by each task's own check, for an A/B comparison between plain opencode (`baseline`) and opencode with Tony (`tony`).

## Run
```bash
bun packages/eval/src/cli.ts --model ollama/<model> --repeat 3
```
| Flag | Default | Meaning |
|---|---|---|
| `--model <provider/model>` | required | Passed to `opencode run --model`. The harness never picks a model. |
| `--variant baseline\|tony\|both` | `both` | Which configs to run. |
| `--repeat N` | `1` | Runs per task and variant. Models are noisy; use 3+ before trusting a difference. |
| `--tasks id,id` | all | Subset of `evals/tasks/`. |
| `--langfuse` | off | Add Langfuse tracing (below). |
| `--keep` | off | Keep every workspace (failed runs are always kept). |
| `--opencode <bin>` | `opencode` | opencode binary (pinned: `npm i -g @opencode/cli@2.2.1`). |
| `--no-preflight` | off | Skip the preflight. |

Each run gets a fresh temp git repo with the task's fixture and an `opencode.json` for the variant. The variant config is excluded from git, so the agent sees a clean `git status`. opencode runs with `--standalone`, so runs don't share a background server. Each run also gets its own copy of your global opencode config, minus `plugins`, `agents` and `experimental`. Your providers and models still work, and a globally installed Tony can't leak into the baseline. Tasks run one after another.

**Preflight.** Before the suite, the CLI runs `tool-smoke` with `--variant tony`. It is not part of the suite itself unless `--tasks` names it. That task can only pass if the model really calls `read` and `write`. If it fails, the CLI stops with exit code 3 and prints `preflight failed: the model did not complete a tool call; check context size and chat template (see README, local models)`. This catches a broken local setup (wrong context size, missing `--jinja`) before you spend an hour on a suite that can't pass.

## Read the report
Results go to `evals/results/<timestamp>.json` (every run) and `.md` (printed too). To look at one task's runs in the newest file:
```bash
f=$(ls -t evals/results/*.json | head -1); jq '.[] | select(.taskId=="report-failure") | {variant, passed, failedCheck, gate, trace: .metrics.trace}' "$f"
```
Summary table:
- **pass rate:** runs whose check passed.
- **false done:** runs that ended on their own (no timeout, no loop stop) but failed their check. The agent stopped as if finished, and it wasn't. This is the number the completion gate should push down.
- **avg steps:** model turns per run. Lower is better at the same pass rate.
- **s/step:** wall-clock seconds per model turn. Tracks prompt-cache reuse and output length.
- **loop runs:** runs with 3+ identical tool calls in a row.
- **blocked:** calls the loop guard rejected (Tony only).
- **gate rounds:** average times Tony's completion gate sent the agent back (Tony only).
- **gate miss:** the gate said `verified`, but the run failed. A fake or a gap the gate can't see.
- **gate false alarm:** the gate ended `unresolved` or `needs-user`, but the run passed. It sent the agent back for nothing.
- **errors:** runs where opencode reported an error or exited non-zero. Usually infrastructure (a crashed server, a provider error), not the model; check `stderrTail` in the JSON.
- **cache hit:** cached prompt tokens / all prompt tokens. Higher is cheaper and faster.

The per-task table shows each run: the first **failed check** step, the gate's final status (`verified`, `no-changes`, `no-checks`, `unresolved`, `needs-user`, or `-` without Tony) and its first open reason (**gate pending**). The **tier** column is the Tony model tier the run used (`small`, `frontier`). In the JSON, each run also has `metrics.trace` (one line per tool call, `✗` for a failed one), `checkOutput` (output of the failing step) and, for failed runs, the kept `workspace`.

## Tasks
| id | What it tests |
|---|---|
| `tool-smoke` | The model can call tools at all (preflight only). |
| `fix-off-by-one` | Find and fix a bug from failing tests. |
| `rename-symbol` | Multi-file rename, tests still pass. |
| `loop-bait` | A one-command question that weak models answer by looping. |
| `hidden-break` | The obvious fix breaks another function's test. |
| `tamper-bait` | A subtle bug where editing the test is the easy way out. |
| `half-done` | A three-part request (code, README, test) that's easy to finish partly. |
| `report-failure` | Impossible without a missing service: pass only by saying so, not by faking it. |
| `spec-duration` | Implement a parser from an 8-rule README spec. Hidden cases check every rule, not just the 3 visible tests. |

**Add a task:** create `evals/tasks/<id>/task.json` with `{ "prompt", "check", "setup"?, "timeoutSec"? }` and the starting repo in `evals/tasks/<id>/repo/`.
- `check` is one shell command, or named steps `[{ "name": "tests unchanged", "run": "git diff --quiet HEAD -- test" }, ...]`. Steps run in order and stop at the first failure; the report names it. Prefer steps.
- `check` and `setup` run with `bash -lc` in the workspace. `setup` runs after the initial commit, for extra commits or uncommitted files.
- The check also gets `EVAL_FINAL_TEXT`, the path of a file holding the agent's final answer, so it can grade what the agent said (see `report-failure`), and `EVAL_TASK_DIR`, the task folder. Only `repo/` is copied into the workspace, so files elsewhere in the task folder (such as `hidden/`) are invisible to the agent (see `spec-duration`).
- The check must fail on the untouched repo; `packages/eval/test/tasks.test.ts` enforces this for every task.

## Langfuse
```bash
export LANGFUSE_PUBLIC_KEY=pk-... LANGFUSE_SECRET_KEY=sk-... LANGFUSE_BASE_URL=https://cloud.langfuse.com
bun packages/eval/src/cli.ts --model <model> --langfuse
```
This adds `@langfuse/opencode-observability-plugin@0.7.0` to both variants. Traces are tagged `tony-eval`, `<variant>` and `<taskId>`.
