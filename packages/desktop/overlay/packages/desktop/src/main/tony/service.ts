// Tony: the Tony app runs its own opencode engine with Tony's brain always loaded.
// - Own registration file (state folder) and port: the app never adopts a plain opencode service, which would run
//   without Tony, and a plain opencode never adopts Tony's.
// - Own database: two services never share one session database.
// - Tony's config (resources/tony/opencode.json, plugin path and the user's tony.json options filled in) as
//   OPENCODE_CONFIG_CONTENT. The user's own opencode config still loads; plugin lists from all configs are combined.
// - An engine left running with other settings (older Tony, moved app, changed options) is restarted.
// These variables go to the engine process, so its children (tools, terminals) see them too; the app's own process
// keeps the user's environment.
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { app } from "electron"
import { withPlugin } from "./config"
import { fingerprint, isCurrent, type Marker } from "./engine"

// Below 0x8000 (Windows reserves ports above it) and apart from opencode's 0xC0DE / 0x70DE.
const PORT = 0x70e1

const resources = () => path.join(process.resourcesPath, "tony")

const stateHome = () => path.join(app.getPath("userData"), "state")

const marker = () => path.join(stateHome(), "tony-engine.json")

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}

/** Where Tony's engine registers itself; the engine writes it under its XDG_STATE_HOME. */
export function registration() {
  return path.join(stateHome(), "opencode", "service.json")
}

export const args = ["--port", String(PORT)]

/** Tony's options from tony.json next to the user's opencode config, for example {"gate": {"maxRounds": 2}}. */
function userOptions() {
  const dir = process.env.OPENCODE_CONFIG_DIR ?? path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "opencode")
  const options = readJson(path.join(dir, "tony.json"))
  return typeof options === "object" && options !== null && !Array.isArray(options) ? options : undefined
}

export function env(): Record<string, string> {
  const config = JSON.parse(readFileSync(path.join(resources(), "opencode.json"), "utf8"))
  return {
    XDG_STATE_HOME: stateHome(),
    OPENCODE_DB: path.join(app.getPath("userData"), "tony.db"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(withPlugin(config, path.join(resources(), "plugin"), userOptions())),
  }
}

let startedHere = false

/** Called when the app starts a new engine. Returns undefined, so the upstream log line after `??` still runs. */
export function started(): undefined {
  startedHere = true
  return undefined
}

/**
 * The engine to connect to: the one found or started, unless it runs with other settings than this app's, in which
 * case it is stopped and a fresh one started.
 */
export async function current<T>(found: T | undefined, ensure: () => Promise<T>, stop: () => Promise<unknown>): Promise<T> {
  const wanted = fingerprint(env())
  const pid = () => readJson(registration())?.pid as number | undefined
  startedHere = false
  const service = found ?? (await ensure())
  if (!startedHere && !isCurrent(readJson(marker()) as Marker | undefined, pid(), wanted)) {
    await stop()
    const fresh = await ensure()
    writeFileSync(marker(), JSON.stringify({ pid: pid(), fingerprint: wanted } satisfies Partial<Marker>))
    return fresh
  }
  if (startedHere) writeFileSync(marker(), JSON.stringify({ pid: pid(), fingerprint: wanted } satisfies Partial<Marker>))
  return service
}

export * as Tony from "./service"
