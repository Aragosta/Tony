import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * The opencode executable to spawn. On Windows npm installs `opencode` as a `.cmd` shim, which Node cannot spawn
 * without a shell, so the real `opencode.exe` inside the global npm package is used instead.
 */
export function opencodeBinary(bin = "opencode", platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32" || bin !== "opencode") return bin
  const root = spawnSync("npm root -g", { shell: true, encoding: "utf8" }).stdout?.trim()
  const exe = root ? join(root, "@opencode", "cli", "bin", "opencode.exe") : ""
  return exe && existsSync(exe) ? exe : bin
}
