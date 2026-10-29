# opencode plugins: what people use, and do we need it

Date: 2026-10-29. Target: opencode **V2.2.0**.

**How popularity was measured:** monthly npm downloads from the npm registry search API. GitHub star pages and api.npmjs.org were blocked in this session. Packages were installed from npm and their code checked for **V2 support**.

That check matters because the V2 loader (`packages/core/src/plugin/module.ts`) only accepts a default export `{ id, effect | setup }`. A plugin built only on the V1 API (`@opencode-ai/plugin`) **does not load on V2**.

Left out of the ranking: provider/auth plugins (Poe, GitLab, Copilot, Gemini…; the biggest group by downloads, but they're about logins, not intelligence) and opencode's own packages.

## Ranking (monthly downloads)

| # | Plugin | Downloads/mo | What it is | V2? | License |
|---|---|---|---|---|---|
| ⚠ | `billion-context` | 2.2M | "Context-compression plugin" | ? | ? |
| 1 | `oh-my-opencode` (OmO) (+ `oh-my-openagent` 130k, `-slim` 43k) | 212k | All-in-one harness: multi-model orchestration, background agents, LSP/AST tools, comment checker | Yes (V1 + V2) | **SUL-1.0** (fair-code, not OSI) |
| 2 | `@langfuse/opencode-observability-plugin` | 217k | Session/tool/LLM traces to Langfuse | Yes (V1 + V2) | MIT |
| 3 | `@braintrust/trace-opencode` / `@devtheops/opencode-plugin-otel` | 114k / 70k | Traces to Braintrust / OpenTelemetry | not checked | — |
| 4 | `context-mode` | 93k | MCP server: runs tools in a sandbox, indexes outputs in SQLite FTS5, returns search hits instead of raw output ("saves 98%") | n/a (MCP) | **Elastic-2.0** |
| 5 | `@tarquinen/opencode-dcp` (Dynamic Context Pruning) | 39k | Prunes duplicate/stale tool outputs, model-called `compress` tool | **No, V1 only** | — |
| – | `opencode-supermemory`, `@vectorize-io/hindsight-coding-agents` | 10k / 65k | Long-term memory | supermemory: V1 only | — |
| – | `openrtk` (Rust Token Killer), `opencode-pty`, `opencode-notify` | 30k / 19k / small | Shell-output compaction, interactive PTY, notifications | — | — |

⚠ `billion-context` published **6,973 versions in under 3 months** (created 2026-08-05). That's about 75 releases a day, and registry mirrors re-download each release, so the count says nothing about real users. Ignore it until someone has looked at what it does.

## Verdict per plugin

**1. OmO: don't install, copy the ideas.** It's a full harness of its own, so it competes with ours rather than fitting into it. It changes a lot of default behaviour, and its license (SUL-1.0) limits commercial use. Its pieces are worth copying:
- LSP/AST tools. These fill the V2 gap we found: no diagnostics after edits.
- The comment checker (a hook that rejects AI-filler comments).
- The "todo enforcer" that won't stop with open todos.

**2. Observability (Langfuse, or OTel): yes, install it first.** Our eval harness needs traces: tokens, cache hits, tool calls, failures per task. It's MIT and supports V2, so we'd be using it rather than building it.

**3. context-mode: test it in the eval, don't adopt it by default.**
- The idea is good: keep bulky output out of context and let the model *search* it.
- But opencode already writes truncated output to files and has Code Mode, so the two overlap.
- It's Elastic-2.0 licensed and adds an MCP server plus SQLite.
- Its "98%" figure is the vendor's own number.

**4. DCP: we need what it does, but it doesn't load on V2.** Its maintainer also now points users to Sleev, a separate proxy. Build its proven tricks into `tony.context` instead:
- Deduplicate repeated tool calls, keeping only the latest output.
- Strip the inputs of errored calls after N turns, keeping the error text.
- Use a placeholder, not deletion, and never modify stored history.
- Recompute only at compaction points, so the prompt cache stays intact.

**5. Memory: later.** It's useful for long-running projects, but the popular ones are V1-only or tied to an external service. Start with AGENTS.md plus `instructions.entry`, and revisit once the eval shows lost knowledge across sessions is a real failure mode.

## Online verification ("keep only true answers")

**Good news:** opencode V2 already has web search built in, with **Exa, TinyFish, Firecrawl, Parallel and Tavily** providers (`packages/core/src/plugin/websearch/`). Plugins can call it through `ctx.websearch.query`, and a side model through `ctx.experimental.generate`. So no extra plugin is needed to reach Exa or TinyFish. Only the verification logic is missing.

**No popular opencode plugin does claim verification.** The closest are:
- `opencode-gemini-grounding` (217 downloads/mo, Gemini-only citations).
- `dsh-fact-check` (for DeepSeek Harness, not opencode).

So we build it: **`tony.factcheck`**.

### Design
1. **Prevent first, check second.** Most wrong coding answers come from guessed APIs, flags and versions. Before writing code against a library, the agent should look up current docs (Exa code search or a Context7-style docs MCP). We add this as an instruction plus a skill, which is cheaper than checking afterwards.
2. **Trigger:** `experimental.idle`, i.e. when the agent is about to give its final answer.
3. **Extract:** a cheap side model pulls out checkable **external** claims: library APIs and signatures, CLI flags, versions, dates, facts about the outside world. Skip the check when there are none, which will be most edit-and-test turns. Cap it at about 5 claims.
4. **Search:** `ctx.websearch.query` per claim, preferring official docs, changelogs and repos via a domain allowlist. Exa for search. TinyFish or Firecrawl to fetch a page when snippets aren't enough.
5. **Judge:** each claim is marked `supported | contradicted | unverifiable`, with the source URL.
6. **Act:**
   - Contradicted: inject one synthetic message ("claim X is contradicted by <url>; fix it") and let the agent correct itself. Bound this to **1–2 rounds**, like `goal.ts` does.
   - Unverifiable: tell the user, rather than deleting the claim.
   - Supported: attach the sources.
7. **Log** every verdict to observability, so we can measure the false-positive rate.

### Limits
- Web search checks **facts**. It doesn't check **code correctness**. For code, the verifier is execution: tests, typecheck, LSP. That's `tony.verify` and `tony.diagnostics`, and they matter more.
- "Not found online" doesn't mean false. Only a contradiction backed by a primary source should change an answer.
- The web is not ground truth. Spam, outdated pages and other LLM output are out there, so use the domain allowlist and recency filters.
- Each check adds roughly 2–10 s and search costs. Gate it by task type, e.g. always for research or Q&A answers, and only when external claims appear for coding turns.
- Vendor claims about TinyFish (free search/fetch tier, benchmark numbers) weren't verified against its official docs.

## Updated plan
0. Config: enable todo, background compaction, `warming`, and the Exa/TinyFish websearch integration.
1. **Install the Langfuse (or OTel) plugin** and build the eval harness.
2. `tony.diagnostics` (LSP/tsc after edits; ideas from OmO) and `tony.edit-guard`.
3. `tony.verify`: tests and checks before finishing.
4. `tony.context`: DCP-style dedup and pruning on V2, cache-safe.
5. `tony.factcheck`: web verification of external claims, plus a docs-lookup skill.
6. Try context-mode and Headroom in the eval. Add memory if the data supports it.
