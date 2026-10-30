// Tony: whether the engine already running is the one this app wants. The engine is a detached background process
// that outlives the app, so after a Tony update, a moved app or changed options it may still run the old settings
// (or point at a plugin folder that no longer exists). No Electron imports, so it can be tested.
import { createHash } from "node:crypto"

/** What Tony records when it starts an engine. */
export type Marker = { pid: number; fingerprint: string }

export function fingerprint(env: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(env).sort())).digest("hex").slice(0, 16)
}

export function isCurrent(marker: Marker | undefined, pid: number | undefined, wanted: string): boolean {
  return pid !== undefined && marker?.pid === pid && marker.fingerprint === wanted
}
