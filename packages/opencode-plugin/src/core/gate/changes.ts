import { isAbsolute, relative, resolve } from "node:path"
import type { ToolAfterEvent } from "../../host.ts"
import { toPosix } from "../../platform.ts"

const MUTATIONS = new Set(["edit", "write", "patch"])

/** Files named in an opencode patch (`*** Add|Update|Delete File: <path>`). */
export function patchFiles(patchText: string): { kind: "add" | "update" | "delete"; path: string }[] {
  return [...patchText.matchAll(/^\*\*\* (Add|Update|Delete) File: (.+)$/gm)].map((m) => ({
    kind: m[1]!.toLowerCase() as "add" | "update" | "delete",
    path: m[2]!.trim(),
  }))
}

function toRelative(directory: string, path: string): string {
  return toPosix(relative(directory, isAbsolute(path) ? path : resolve(directory, path)))
}

/** Files a mutation call touches, relative to `directory`. */
function targets(tool: string, input: unknown, directory: string): string[] {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === "patch") return typeof i.patchText === "string" ? patchFiles(i.patchText).map((f) => toRelative(directory, f.path)) : []
  return typeof i.path === "string" ? [toRelative(directory, i.path)] : []
}

interface Turn {
  files: Set<string>
  seq: number
}

/** Which files changed this turn, and a counter that moves on every change, so the gate runs checks once per change. */
export class ChangeTracker {
  private turns = new Map<string, Turn>()

  private turn(sessionID: string): Turn {
    let t = this.turns.get(sessionID)
    if (!t) this.turns.set(sessionID, (t = { files: new Set(), seq: 0 }))
    return t
  }

  beginTurn(sessionID: string): void {
    this.turns.delete(sessionID)
  }

  /** A completed `edit`, `write` or `patch`. */
  after(e: ToolAfterEvent, directory: string): void {
    if (e.status !== "completed" || !MUTATIONS.has(e.tool)) return
    const t = this.turn(e.sessionID)
    for (const path of targets(e.tool, e.input, directory)) t.files.add(path)
    t.seq++
  }

  /** Files opencode's snapshot saw change, which includes changes made by shell commands. */
  addSnapshotFiles(sessionID: string, files: readonly string[]): void {
    const t = this.turn(sessionID)
    const fresh = files.map(toPosix).filter((f) => !t.files.has(f))
    if (fresh.length === 0) return
    for (const f of fresh) t.files.add(f)
    t.seq++
  }

  changes(sessionID: string): { files: string[]; seq: number } {
    const t = this.turn(sessionID)
    return { files: [...t.files].sort(), seq: t.seq }
  }
}
