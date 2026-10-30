import type { LoopGuardOptions } from "../../options.ts"

export type LoopVerdict = { kind: "ok" } | { kind: "block"; count: number } | { kind: "stop"; count: number }

interface Streak {
  key: string | undefined
  count: number
}

/** Counts consecutive identical tool calls per session. */
export class LoopDetector {
  private streaks = new Map<string, Streak>()

  constructor(private opts: Pick<LoopGuardOptions, "blockAt" | "stopAt">) {}

  record(sessionID: string, key: string): LoopVerdict {
    const streak = this.streaks.get(sessionID)
    const count = streak?.key === key ? streak.count + 1 : 1
    this.streaks.set(sessionID, { key, count })
    if (count >= this.opts.stopAt) return { kind: "stop", count }
    if (count >= this.opts.blockAt) return { kind: "block", count }
    return { kind: "ok" }
  }

  markMutation(sessionID: string): void {
    this.streaks.set(sessionID, { key: undefined, count: 0 })
  }

  reset(sessionID: string): void {
    this.streaks.delete(sessionID)
  }
}
