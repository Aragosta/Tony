import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import type { Host, ToolBeforeEvent } from "../host.ts"
import type { EditGuardOptions } from "../options.ts"
import { patchFiles } from "../gate/tamper.ts"

export function notReadMessage(path: string): string {
  return `Edit refused: read ${path} before editing it, so the change is based on its current content.`
}

export function changedMessage(path: string): string {
  return `Edit refused: ${path} changed since you last read it (by a command, a formatter or the user). Read it again before editing.`
}

const isFile = (p: string) => existsSync(p) && statSync(p).isFile()
const digest = (p: string) => createHash("sha1").update(readFileSync(p)).digest("hex")

/** Files a mutation must have read first: edit/write targets and patch Update/Delete files. */
function guarded(tool: string, input: unknown): string[] {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === "edit" || tool === "write") return typeof i.path === "string" ? [i.path] : []
  if (tool === "patch" && typeof i.patchText === "string") {
    return patchFiles(i.patchText).filter((f) => f.kind !== "add").map((f) => f.path)
  }
  return []
}

function touched(tool: string, input: unknown): string[] {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === "patch" && typeof i.patchText === "string") return patchFiles(i.patchText).map((f) => f.path)
  return guarded(tool, input)
}

/**
 * `onRefuse` hears about each refusal: opencode fires no after-hook for a call a before-hook rejected, so this is
 * the only way other modules (the completion gate) learn the edit never happened.
 */
export async function registerEditGuard(
  host: Host,
  opts: EditGuardOptions,
  onRefuse?: (e: ToolBeforeEvent, message: string, directory: string) => void,
): Promise<void> {
  if (!opts.enabled) return
  // sessionID -> absolute path -> sha1 of the content the session last read or wrote
  const seen = new Map<string, Map<string, string>>()
  const directories = new Map<string, string>()
  const directory = async (sessionID: string) => {
    let d = directories.get(sessionID)
    if (!d) directories.set(sessionID, (d = (await host.sessionInfo(sessionID)).directory))
    return d
  }
  const files = (sessionID: string) => {
    let m = seen.get(sessionID)
    if (!m) seen.set(sessionID, (m = new Map()))
    return m
  }

  await host.onToolBefore(async (e) => {
    const paths = guarded(e.tool, e.input)
    if (paths.length === 0) return
    const dir = await directory(e.sessionID)
    for (const path of paths) {
      const abs = isAbsolute(path) ? path : resolve(dir, path)
      if (!isFile(abs)) continue
      const shown = relative(dir, abs)
      const known = files(e.sessionID).get(abs)
      const message = known === undefined ? notReadMessage(shown) : known !== digest(abs) ? changedMessage(shown) : undefined
      if (message === undefined) continue
      try {
        onRefuse?.(e, message, dir)
      } catch {}
      throw new Error(message)
    }
  })

  await host.onToolAfter(async (e) => {
    if (e.status !== "completed") return
    const paths = e.tool === "read" ? [String(((e.input ?? {}) as { path?: unknown }).path ?? "")] : touched(e.tool, e.input)
    if (paths.length === 0) return
    const dir = await directory(e.sessionID)
    for (const path of paths) {
      const abs = isAbsolute(path) ? path : resolve(dir, path)
      if (isFile(abs)) files(e.sessionID).set(abs, digest(abs))
    }
  })
}
