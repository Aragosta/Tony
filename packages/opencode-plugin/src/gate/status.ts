import { appendFileSync } from "node:fs"
import type { GateStatus } from "./decide.ts"

export interface StatusRecord {
  sessionID: string
  status: GateStatus
  rounds: number
  checks: { command: string; ok: boolean; skipped?: boolean }[]
  pending: string[]
  testsChanged: string[]
  judge?: "done" | "continue" | "blocked" | "invalid"
}

/** Appends one JSON line to $TONY_STATUS_FILE when it is set (the eval sets it). Never throws. */
export function writeStatus(record: StatusRecord): void {
  const file = process.env.TONY_STATUS_FILE
  if (!file) return
  try {
    appendFileSync(file, JSON.stringify(record) + "\n")
  } catch {}
}
