// Tony: the Tony app runs its own opencode engine with Tony's brain always loaded.
// - Own registration file (state folder) and port: the app never adopts a plain opencode service, which would run
//   without Tony, and a plain opencode never adopts Tony's.
// - Own database: two services never share one session database.
// - Tony's config (resources/tony/opencode.json, plugin path filled in) as OPENCODE_CONFIG_CONTENT. The user's own
//   opencode config still loads; plugin lists from all configs are combined.
// Only the engine process gets these variables; the app's terminals keep the user's environment.
import { readFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import { withPlugin } from "./config"

// Below 0x8000 (Windows reserves ports above it) and apart from opencode's 0xC0DE / 0x70DE.
const PORT = 0x70e1

const resources = () => path.join(process.resourcesPath, "tony")

const stateHome = () => path.join(app.getPath("userData"), "state")

/** Where Tony's engine registers itself; the engine writes it under its XDG_STATE_HOME. */
export function registration() {
  return path.join(stateHome(), "opencode", "service.json")
}

export const args = ["--port", String(PORT)]

export function env(): Record<string, string> {
  const config = JSON.parse(readFileSync(path.join(resources(), "opencode.json"), "utf8"))
  return {
    XDG_STATE_HOME: stateHome(),
    OPENCODE_DB: path.join(app.getPath("userData"), "tony.db"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(withPlugin(config, path.join(resources(), "plugin"))),
  }
}

export * as Tony from "./service"
