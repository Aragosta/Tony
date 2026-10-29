// The few places Tony depends on the operating system. Each helper takes the platform so both branches are testable.
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { join } from "node:path"

export type Platform = NodeJS.Platform

const windows = (p: Platform) => p === "win32"

/** Forward slashes, so relative paths compare, match and reach `git show` the same way on every OS. */
export const toPosix = (path: string) => path.replaceAll("\\", "/")

/** One argument for the platform's shell, with nothing inside expanded: bash single quotes, cmd double quotes. */
export function shellQuote(s: string, platform: Platform = process.platform): string {
  return windows(platform) ? `"${s.replaceAll('"', '""')}"` : `'${s.replaceAll("'", `'\\''`)}'`
}

/** Whether `command` is on PATH: executable on POSIX, any PATHEXT extension on Windows. */
export function onPath(command: string, env: NodeJS.ProcessEnv = process.env, platform: Platform = process.platform): boolean {
  const dirs = (env.PATH ?? env.Path ?? "").split(windows(platform) ? ";" : ":").filter(Boolean)
  if (windows(platform)) {
    const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    return dirs.some((d) => exts.some((ext) => [ext, ext.toLowerCase()].some((e) => isFile(join(d, command + e)))))
  }
  return dirs.some((d) => {
    try {
      accessSync(join(d, command), constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

const isFile = (p: string) => existsSync(p) && statSync(p).isFile()

export interface SpawnSpec {
  file: string
  args: string[]
  shell: boolean
  detached: boolean
}

/**
 * POSIX: a bash login shell (the user's PATH, version managers) in its own process group, so a timeout kills
 * everything it started. Windows: cmd.exe, whose `&&` the detected checks use.
 */
export function spawnSpec(command: string, platform: Platform = process.platform): SpawnSpec {
  return windows(platform)
    ? { file: command, args: [], shell: true, detached: false }
    : { file: "bash", args: ["-lc", command], shell: false, detached: true }
}

/** The command that kills a process tree on Windows; undefined on POSIX, where the process group is killed. */
export function killCommand(pid: number, platform: Platform = process.platform): { file: string; args: string[] } | undefined {
  return windows(platform) ? { file: "taskkill", args: ["/pid", String(pid), "/T", "/F"] } : undefined
}
