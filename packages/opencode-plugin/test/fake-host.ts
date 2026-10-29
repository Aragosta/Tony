import type { ContextCap, ContextEvent, Host, ModelEntry, PromptEvent, ToolAfterEvent, ToolBeforeEvent } from "../src/host.ts"

type Cb<E> = (e: E) => void | Promise<void>

export function createFakeHost() {
  const beforeCbs: Cb<ToolBeforeEvent>[] = []
  const afterCbs: Cb<ToolAfterEvent>[] = []
  const contextCbs: Cb<ContextEvent>[] = []
  const promptCbs: Cb<PromptEvent>[] = []
  /** child sessionID -> parent sessionID */
  const parents = new Map<string, string>()
  const interrupts: string[] = []
  const customSystemAgents = new Set<string>()
  let plan: ((models: readonly ModelEntry[]) => readonly ContextCap[]) | undefined

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
    async onPrompt(cb) {
      promptCbs.push(cb)
    },
    async rootSession(sessionID) {
      let id = sessionID
      while (parents.has(id)) id = parents.get(id)!
      return id
    },
    async interrupt(sessionID) {
      interrupts.push(sessionID)
    },
    async agentHasCustomSystem(agentID) {
      return customSystemAgents.has(agentID)
    },
    async onModels(p) {
      plan = p
    },
  }

  return {
    host,
    interrupts,
    customSystemAgents,
    parents,
    async prompt(sessionID: string) {
      for (const cb of promptCbs) await cb({ sessionID })
    },
    async before(e: ToolBeforeEvent) {
      for (const cb of beforeCbs) await cb(e)
    },
    async after(e: ToolAfterEvent) {
      for (const cb of afterCbs) await cb(e)
    },
    async context(e: ContextEvent) {
      for (const cb of contextCbs) await cb(e)
    },
    models(entries: readonly ModelEntry[]): readonly ContextCap[] {
      return plan ? plan(entries) : []
    },
  }
}
