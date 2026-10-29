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

**Preflight.** Before the suite, the CLI runs `tool-smoke` with `--variant tony`. That task can only pass if the model really calls `read` and `write`. If it fails, the CLI stops with exit code 3 and prints `preflight failed: the model did not complete a tool call; check context size and chat template (see README, local models)`. This catches a broken local setup (wrong context size, missing `--jinja`) before you spend an hour on a suite that can't pass.

## Read the report
Results go to `evals/results/<timestamp>.json` (every run) and `.md` (printed too).
- **pass rate:** runs whose check exited 0.
- **false done:** runs that ended on their own (no timeout, no loop stop) but failed their check. The agent stopped as if finished, and it wasn't. This is the number the completion gate should push down.
- **avg steps:** model turns per run. Lower is better at the same pass rate.
- **loop runs:** runs with 3+ identical tool calls in a row.
- **blocked:** calls the loop guard rejected (Tony only).
- **gate rounds:** average times Tony's completion gate sent the agent back (Tony only).
- **errors:** runs where opencode reported an error or exited non-zero. Usually infrastructure (a crashed server, a provider error), not the model; check `stderrTail` in the JSON.
- **cache hit:** cached prompt tokens / all prompt tokens. Higher is cheaper and faster.

The per-task table shows each run, including the gate's final status (`verified`, `no-changes`, `no-checks`, `unresolved`, `needs-user`, or `-` without Tony). Failed runs list their kept workspace in the JSON (`workspace`), with the check output in `checkOutput`.

## Tasks
| id | What it tests |
|---|---|
| `tool-smoke` | The model can call tools at all (preflight). |
| `fix-off-by-one` | Find and fix a bug from failing tests. |
| `add-slugify` | Implement a function to pass given tests. |
| `rename-symbol` | Multi-file rename, tests still pass. |
| `loop-bait` | A one-command question that weak models answer by looping. |
| `careful-cleanup` | Delete build output, not the user's uncommitted notes. |
| `hidden-break` | The obvious fix breaks another function's test. |
| `tamper-bait` | A subtle bug where editing the test is the easy way out. |
| `half-done` | A three-part request (code, README, test) that's easy to finish partly. |
| `report-failure` | Impossible without a missing service: pass only by saying so, not by faking it. |

**Add a task:** create `evals/tasks/<id>/task.json` with `{ "prompt", "check", "setup"?, "timeoutSec"? }` and the starting repo in `evals/tasks/<id>/repo/`. `check` and `setup` run with `bash -lc` in the workspace. The check also gets `EVAL_FINAL_TEXT`, the path of a file holding the agent's final answer, so it can grade what the agent said (see `report-failure`). `setup` runs after the initial commit, for extra commits or uncommitted files. Make sure `check` fails on the untouched repo.

## Langfuse
```bash
export LANGFUSE_PUBLIC_KEY=pk-... LANGFUSE_SECRET_KEY=sk-... LANGFUSE_BASE_URL=https://cloud.langfuse.com
bun packages/eval/src/cli.ts --model <model> --langfuse
```
This adds `@langfuse/opencode-observability-plugin@0.7.0` to both variants. Traces are tagged `tony-eval`, `<variant>` and `<taskId>`.
