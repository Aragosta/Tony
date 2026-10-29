import type { ContextEvent, Host, ToolAfterEvent, ToolBeforeEvent } from "../src/host.ts"

type Cb<E> = (e: E) => void | Promise<void>

export function createFakeHost() {
  const beforeCbs: Cb<ToolBeforeEvent>[] = []
  const afterCbs: Cb<ToolAfterEvent>[] = []
  const contextCbs: Cb<ContextEvent>[] = []
  const interrupts: string[] = []
  const customSystemAgents = new Set<string>()

  const host: Host = {
    async onToolBefore(cb) {
      beforeCbs.push(cb)
    },
    async onToolAfter(cb) {
      afterCbs.push(cb)
    },
    async onContext(cb) {
      contextCbs.push(cb)
    },
    async interrupt(sessionID) {
      interrupts.push(sessionID)
    },
    async agentHasCustomSystem(agentID) {
      return customSystemAgents.has(agentID)
    },
  }

  return {
    host,
    interrupts,
    customSystemAgents,
    async before(e: ToolBeforeEvent) {
      for (const cb of beforeCbs) await cb(e)
    },
    async after(e: ToolAfterEvent) {
      for (const cb of afterCbs) await cb(e)
    },
    async context(e: ContextEvent) {
      for (const cb of contextCbs) await cb(e)
    },
  }
}
