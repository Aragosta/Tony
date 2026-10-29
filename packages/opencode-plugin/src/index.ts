// The only file that touches the opencode plugin API. Everything else talks to `Host`.
import { Plugin } from "@opencode/plugin"
import type { Host, TextPart } from "./host.ts"
import { registerLoopGuard } from "./loop/guard.ts"
import { parseOptions } from "./options.ts"
import { registerPrompt } from "./prompt/register.ts"

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
                result: { content: e.result.content as string | ReadonlyArray<TextPart> | undefined },
              }
            : { tool: e.tool, sessionID: e.sessionID, input: e.input, status: "error" },
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
  }
}

export default Plugin.define({
  id: "tony",
  async setup(ctx) {
    const o = parseOptions(ctx.options)
    const host = createHost(ctx)
    await registerLoopGuard(host, o.loopGuard)
    await registerPrompt(host, o.prompt, o.local)
  },
})
