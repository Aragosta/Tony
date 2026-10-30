import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * The opencode executable to spawn. `TONY_OPENCODE_BIN` selects another engine, such as the one bundled in the Tony
 * app; an explicit `bin` still wins. On Windows npm installs `opencode` as a `.cmd` shim, which Node cannot spawn
 * without a shell, so the real `opencode.exe` inside the global npm package is used instead.
 */
export function opencodeBinary(
  bin = "opencode",
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): string {
  if (bin === "opencode" && env.TONY_OPENCODE_BIN) return env.TONY_OPENCODE_BIN
  if (platform !== "win32" || bin !== "opencode") return bin
  const root = spawnSync("npm root -g", { shell: true, encoding: "utf8" }).stdout?.trim()
  const exe = root ? join(root, "@opencode", "cli", "bin", "opencode.exe") : ""
  return exe && existsSync(exe) ? exe : bin
}
