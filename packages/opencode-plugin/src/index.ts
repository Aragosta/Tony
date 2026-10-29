// The only file that touches the opencode plugin API. Everything else talks to `Host`.
import { Plugin } from "@opencode/plugin"
import { registerDiagnostics } from "./diagnostics/register.ts"
import { registerEditGuard } from "./edit/guard.ts"
import { EvidenceTracker } from "./gate/evidence.ts"
import { registerGate } from "./gate/register.ts"
import type { Host, TextPart, TranscriptMessage } from "./host.ts"
import { registerLocalContext } from "./local/context.ts"
import { registerLoopGuard } from "./loop/guard.ts"
import { parseOptions } from "./options.ts"
import { registerPrompt } from "./prompt/register.ts"
import { detectChecks } from "./verify/detect.ts"
import { exec } from "./verify/exec.ts"

type PluginContext = Parameters<Plugin.Plugin["setup"]>[0]

export function createHost(ctx: PluginContext): Host {
  return {
    async onToolBefore(cb) {
      await ctx.tool.hook("execute.before", (e) => cb({ tool: e.tool, sessionID: e.sessionID, input: e.input }))
    },
    async onToolAfter(cb) {
      await ctx.tool.hook("execute.after", (e) =>
        cb(
          e.status === "completed"
            ? {
                tool: e.tool,
                sessionID: e.sessionID,
                input: e.input,
                status: "completed",
                result: {
                  content: e.result.content as string | ReadonlyArray<TextPart> | undefined,
                  output: e.result.output,
                  metadata: e.result.metadata as Record<string, unknown> | undefined,
                },
                // opencode reads the event's result after the hooks, so replacing it changes what the model sees.
                append(text) {
                  const content = e.result.content
                  e.result = {
                    ...e.result,
                    content:
                      content === undefined
                        ? text
                        : typeof content === "string"
                          ? content + text
                          : [...content, { type: "text" as const, text }],
                  }
                },
              }
            : { tool: e.tool, sessionID: e.sessionID, input: e.input, status: "error", error: { message: e.error.message } },
        ),
      )
    },
    async onContext(cb) {
      await ctx.session.hook("context", (e) =>
        cb({
          agent: e.agent,
          model: { providerID: e.model.providerID, id: e.model.id },
          // Same array object, so replacing system[0] edits the real request.
          system: e.system,
          tools: e.tools,
        }),
      )
    },
    async onPrompt(cb) {
      await ctx.session.hook("prompt", (e) => cb({ sessionID: e.sessionID }))
    },
    async rootSession(sessionID) {
      let id = sessionID
      // Bounded walk up parentID; a lookup failure falls back to the deepest session found.
      for (let depth = 0; depth < 16; depth++) {
        const parent = await ctx.session
          .get({ sessionID: id })
          .then((s) => s.parentID)
          .catch(() => undefined)
        if (!parent) break
        id = parent
      }
      return id
    },
    async interrupt(sessionID) {
      await ctx.session.interrupt({ sessionID })
    },
    async agentHasCustomSystem(agentID) {
      try {
        return Boolean((await ctx.agent.get({ agentID })).data.system)
      } catch {
        return false
      }
    },
    async onIdle(cb) {
      await ctx.session.hook("experimental.idle", (e) =>
        cb({ sessionID: e.sessionID, background: e.background.map((b) => ({ kind: b.kind, sessionID: b.sessionID })) }),
      )
    },
    async sessionInfo(sessionID) {
      const s = await ctx.session.get({ sessionID })
      return { directory: s.location.directory, ...(s.parentID ? { parentID: s.parentID } : {}) }
    },
    async transcript(sessionID) {
      const messages = await ctx.session.context({ sessionID })
      return messages.flatMap((m): TranscriptMessage[] => {
        if (m.type === "user" || m.type === "synthetic") return [{ type: m.type, text: m.text }]
        if (m.type !== "assistant") return []
        const text = m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
        const tools = m.content.flatMap((p) => (p.type === "tool" ? [p.name] : []))
        return [{ type: "assistant", text, tools, files: [...(m.snapshot?.files ?? [])] }]
      })
    },
    async continueWith(sessionID, text, description) {
      await ctx.session.synthetic({ sessionID, text, description, metadata: { source: "tony-gate" } })
    },
    async judge(sessionID, prompt) {
      return (await ctx.session.generate({ sessionID, prompt })).text
    },
    async onModels(plan) {
      await ctx.model.transform((models) => {
        const caps = plan(
          models.list().map((m) => ({ providerID: m.providerID, id: m.id, context: m.limit?.context })),
        )
        for (const cap of caps) {
          models.update(cap.providerID, cap.id, (draft) => {
            const input = draft.limit?.input
            draft.limit = {
              ...draft.limit,
              context: cap.context,
              // input must fit inside the window too.
              ...(input !== undefined && input > cap.context ? { input: cap.context } : {}),
            }
          })
        }
      })
    },
  }
}

export default Plugin.define({
  id: "tony",
  async setup(ctx) {
    const o = parseOptions(ctx.options)
    const host = createHost(ctx)
    await registerLoopGuard(host, o.loopGuard)
    await registerPrompt(host, o.prompt, o.local)
    await registerLocalContext(host, o.local)
    // Order matters: a refused edit (edit guard) must not trigger a diagnostics baseline run.
    await registerEditGuard(host, o.editGuard)
    await registerDiagnostics(host, o.diagnostics)
    await registerGate(host, o.gate, { exec, detect: detectChecks, tracker: new EvidenceTracker() })
  },
})
