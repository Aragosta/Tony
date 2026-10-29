import type {
  ContextCap,
  ContextEvent,
  Host,
  IdleBackground,
  IdleEvent,
  ModelEntry,
  PromptEvent,
  SessionInfo,
  ToolAfterEvent,
  ToolBeforeEvent,
  TranscriptMessage,
} from "../src/host.ts"

type Cb<E> = (e: E) => void | Promise<void>
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
/** Tests pass completed events without `append`; the fake supplies one. */
export type AfterInput = DistributiveOmit<ToolAfterEvent, "append">

export function createFakeHost() {
  const beforeCbs: Cb<ToolBeforeEvent>[] = []
  const afterCbs: Cb<ToolAfterEvent>[] = []
  const contextCbs: Cb<ContextEvent>[] = []
  const promptCbs: Cb<PromptEvent>[] = []
  const idleCbs: Cb<IdleEvent>[] = []
  const sessions = new Map<string, SessionInfo>()
  const transcripts = new Map<string, TranscriptMessage[]>()
  const continued: { sessionID: string; text: string; description: string }[] = []
  const judgeReplies: string[] = []
  const judgePrompts: string[] = []
  const appended: string[] = []
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
    async onIdle(cb) {
      idleCbs.push(cb)
    },
    async sessionInfo(sessionID) {
      return sessions.get(sessionID) ?? { directory: process.cwd() }
    },
    async transcript(sessionID) {
      return transcripts.get(sessionID) ?? []
    },
    async continueWith(sessionID, text, description) {
      continued.push({ sessionID, text, description })
    },
    async judge(_sessionID, prompt) {
      judgePrompts.push(prompt)
      return judgeReplies.shift() ?? ""
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
    sessions,
    transcripts,
    continued,
    judgeReplies,
    judgePrompts,
    appended,
    async idle(sessionID: string, background: IdleBackground[] = []) {
      for (const cb of idleCbs) await cb({ sessionID, background })
    },
    async prompt(sessionID: string) {
      for (const cb of promptCbs) await cb({ sessionID })
    },
    async before(e: ToolBeforeEvent) {
      for (const cb of beforeCbs) await cb(e)
    },
    /** One tool call as opencode 2.2.1 runs it: a before-hook that throws refuses the call, and no after-hook fires. */
    async call(before: ToolBeforeEvent, after: (e: ToolBeforeEvent) => AfterInput): Promise<string | undefined> {
      try {
        await this.before(before)
      } catch (err) {
        return (err as Error).message
      }
      await this.after(after(before))
      return undefined
    },
    async after(input: AfterInput) {
      const e = (
        input.status === "completed" ? { ...input, append: (t: string) => void appended.push(t) } : input
      ) as ToolAfterEvent
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
