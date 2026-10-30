# Tony evals

A fixed task suite run through `opencode run`, scored by each task's own check, for an A/B comparison between plain opencode (`baseline`) and opencode with Tony (`tony`).

## Run
```bash
bun packages/eval/src/cli.ts --model ollama/<model> --repeat 3
```
| Flag | Default | Meaning |
|---|---|---|
| `--model <provider/model>` | required | Passed to `opencode run --model`. The harness never picks a model. |
| `--variant name,name` | `baseline,tony` | Which configs to run, by name from `evals/variants.json` (`both` = `baseline,tony`). |
| `--repeat N` | `1` | Runs per task and variant. Models are noisy; use 3+ before trusting a difference. |
| `--tasks id,id` | all | Subset of `evals/tasks/`. |
| `--langfuse` | off | Add Langfuse tracing (below). |
| `--keep` | off | Keep every workspace (failed runs are always kept). |
| `--opencode <bin>` | `opencode` | opencode binary (pinned: `npm i -g @opencode/cli@2.2.1`). |
| `--no-preflight` | off | Skip the preflight. |

Each run gets a fresh temp git repo with the task's fixture and an `opencode.json` for the variant. The variant config is excluded from git, so the agent sees a clean `git status`. opencode runs with `--standalone`, so runs don't share a background server. Each run also gets its own copy of your global opencode config, minus `plugins`, `agents` and `experimental`. Your providers and models still work, and a globally installed Tony can't leak into the baseline. Tasks run one after another.

**Preflight.** Before the suite, the CLI runs `tool-smoke` with `--variant tony`. It is not part of the suite itself unless `--tasks` names it. That task can only pass if the model really calls `read` and `write`. If it fails, the CLI stops with exit code 3 and prints `preflight failed: the model did not complete a tool call; check context size and chat template (see README, local models)`. This catches a broken local setup (wrong context size, missing `--jinja`) before you spend an hour on a suite that can't pass.

**Variants** (`evals/variants.json`): a name maps to Tony's plugin options, or to `null` for plain opencode. Turn one feature on or off per variant, and keep it only if the eval shows a difference:
```json
{ "baseline": null, "tony": {}, "tony-review": { "gate": { "review": true } }, "tony-no-gate": { "gate": { "enabled": false } } }
```

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

The per-task table shows each run: the first **failed check** step, the gate's final status (`verified`, `no-changes`, `no-checks`, `unresolved`, `needs-user`, or `-` without Tony) and its first open reason (**gate pending**). In the JSON, each run also has `metrics.trace` (one line per tool call, `✗` for a failed one), `checkOutput` (output of the failing step) and, for failed runs, the kept `workspace`.

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

## Diagnostic runs
The A/B suite says *whether* a run passed. Diagnostic runs show *how* it got there: every step from prompt to answer, the model's thinking, each tool call with its input and result, and where it went wrong. Use them to pick features from observed failures.
```bash
bun packages/eval/src/diag.ts --model llamacpp/<model> --repeat 3
```
| Flag | Default | Meaning |
|---|---|---|
| `--model <provider/model>` | required | As above. |
| `--variant name,name` | `baseline` | Names from `evals/variants.json`. Start with plain opencode to see what the model does on its own. |
| `--repeat N` | `1` | Runs per task. |
| `--tasks id,id` | all | Subset of the suite. |
| `--suite <dir>` | `evals/diag` | Any folder of tasks, `evals/tasks` too. |
| `--keep` | off | Keep every workspace (failed runs are always kept). |
| `--replay <dir>` | | Rebuild all pages in a results folder from the saved events, after changing the analysis. No model needed. |

opencode runs with `--thinking`, so the model's reasoning (llama.cpp's `reasoning_content`) is in the event stream. Output goes to `evals/diag-results/<timestamp>/`:
- `README.md`: pass rate per task, one row per run with its **first wrong turn**, a **failure-mode table** (how many failed and passed runs show each finding) and averages for tool use and thinking.
- `<task>.<variant>.<n>.md`: one run, from prompt to answer.
  - **Prompt to answer:** the phases in one line, e.g. `explore (1–3: read src/prices.ts, …) → edit (4) → verify (5: bun test ✓) → answer (6)`.
  - **Result and first wrong turn.**
  - **Findings, Numbers.**
  - **Timeline:** per step, the thinking, each call with input and output (failed calls open), and the text.
  - **Final answer, grader output, changed files and diff.**
- `.events.jsonl` (raw opencode events), `.meta.json` and `.diff`: kept so `--replay` can rebuild the pages.

**Findings** use a fixed vocabulary, so they can be counted across runs. 🔴 bad, 🟡 warning, ⚪ note.
| Kind | Means |
|---|---|
| `toolcall-as-text` | A tool call came out as text: the chat template or llama-server `--jinja` isn't parsing calls. Fix the setup first. |
| `key-file-missed`, `key-file-not-changed` | Never opened, or never changed, a file where the fix lives (`diag.keyFiles`). |
| `incomplete-fix` | The agent's own checks passed but the grader's hidden cases failed: it fixed what the visible tests show. |
| `false-claim`, `honest-failure`, `blocked` | How the answer relates to the result. |
| `no-verify`, `unverified-final-edit`, `ended-on-failing-check`, `check-flailing` | How it checked its work. |
| `blind-edit`, `edit-no-match`, `retry-unchanged`, `repeat-call`, `oscillation`, `whole-file-write`, `file-not-found`, `bad-arguments`, `tool-error` | How it used tools. |
| `serial-reads` | 3+ steps in a row with one read each: could have been one turn. |
| `ended-announcing`, `no-answer` | Stopped with "Let me …", or with no answer. |
| `long-thinking`, `no-thinking` | Thinking over 8,000 characters in one step, or none at all. |
| `protected-changed` | Changed a protected path (`diag.protect`, usually `test/`). |
| `check-failed`, `timeout`, `infra-error`, `loop-guard`, `gate-nudge` | The grader's verdict, and harness events. |

The **first wrong turn** is the most basic cause found: broken setup, then the wrong files, then unchecked work, then the earliest bad finding.

**The suite (`evals/diag/`).** Five hard tasks. Each has visible tests, hidden grader cases, a reference `solution/` and `diag` hints. `packages/eval/test/diag-tasks.test.ts` checks that every task fails untouched and passes with its solution.
| id | Tests | Trap |
|---|---|---|
| `stale-cache` | Symptom to root cause; fix every occurrence | Fixing only the visible case and missing the bulk-import path |
| `async-pool` | Async reasoning against a 6-rule spec | Keeping the batch barrier or the swallowed errors |
| `signature-migration` | A refactor across 13 call sites in 6 files | The `...args` forwarding; swapping body and headers |
| `deep-rounding` | Following a call chain through 29 files with look-alikes | Fixing the deprecated copy, or patching only the visible path |
| `calc-spec` | Writing a parser from an 11-rule spec | Right associativity, `-2^2`, error positions; stopping at the 4 visible tests |

A task's `diag` field in `task.json`: `{ "skill", "trap", "keyFiles": [...], "protect": [...] }`. Any eval task can carry it.

## Langfuse
```bash
export LANGFUSE_PUBLIC_KEY=pk-... LANGFUSE_SECRET_KEY=sk-... LANGFUSE_BASE_URL=https://cloud.langfuse.com
bun packages/eval/src/cli.ts --model <model> --langfuse
```
This adds `@langfuse/opencode-observability-plugin@0.7.0` to both variants. Traces are tagged `tony-eval`, `<variant>` and `<taskId>`.
