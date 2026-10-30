// The built Tony app (bun run --cwd packages/desktop build) runs its own engine with Tony's brain loaded.
// Opt in: TONY_APP=1 bun test packages/desktop/test/app.test.ts (on Linux under xvfb-run -a).
import { afterAll, describe, expect, test } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const enabled = process.env.TONY_APP === "1"
const built = join(import.meta.dir, "../.build/app.json")
const TONY_PORT = 0x70e1

type Service = { url: string; password: string; pid: number }
type Plugin = { id: string; source: { type: string; path?: string }; state: { status: string } }

describe.skipIf(!enabled)("Tony app", () => {
  // OPENCODE_DESKTOP_TEST_ROOT points the app's data, config and state folders at a temporary root.
  const root = mkdtempSync(join(tmpdir(), "tony-app-"))
  // Tony registers its engine in its own state folder (userData is <root>/desktop under a test root).
  const registration = join(root, "desktop", "state", "opencode", "service.json")
  let app: ChildProcess | undefined
  let service: Service | undefined

  async function quit() {
    if (!app || app.exitCode !== null) return
    const exited = new Promise((resolve) => app!.once("exit", resolve))
    app.kill()
    await exited
  }

  /** Launches the app and waits until an engine that `accept`s runs with Tony active. */
  async function launch(accept: (pid: number) => boolean = () => true): Promise<{ service: Service; tony: Plugin | undefined }> {
    const { executable } = JSON.parse(readFileSync(built, "utf8"))
    app = spawn(executable, process.platform === "linux" ? ["--no-sandbox"] : [], {
      env: { ...process.env, OPENCODE_DESKTOP_TEST_ROOT: root },
      stdio: "ignore",
    })
    const deadline = Date.now() + 90_000
    let tony: Plugin | undefined
    while (Date.now() < deadline) {
      const found: Service | undefined = existsSync(registration) ? JSON.parse(readFileSync(registration, "utf8")) : undefined
      // The engine registers before it has loaded config and plugins, so ask until Tony shows up or time runs out.
      if (found && accept(found.pid)) {
        service = found
        const plugins: Plugin[] | undefined = await fetch(new URL("/api/plugin", found.url), {
          headers: { authorization: `Basic ${btoa(`opencode:${found.password}`)}` },
        })
          .then((response) => response.json())
          .then((body) => body.data)
          .catch(() => undefined)
        tony = plugins?.find((plugin) => plugin.id === "tony")
        if (tony?.state.status === "active") break
      }
      await Bun.sleep(500)
    }
    expect(service).toBeDefined()
    return { service: service!, tony }
  }

  afterAll(async () => {
    await quit()
    try {
      if (service) process.kill(service.pid)
    } catch {}
    // Best effort: on Windows the engine may hold files open for a moment after it is stopped.
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch {}
  })

  test("starts its own engine with Tony's brain active", async () => {
    expect(existsSync(built)).toBe(true)
    const { service, tony } = await launch()
    expect(new URL(service.url).port).toBe(String(TONY_PORT))
    // Nothing registered where a plain opencode looks (XDG_STATE_HOME is <root>/state under a test root).
    expect(existsSync(join(root, "state", "opencode", "service.json"))).toBe(false)
    expect(tony?.state.status).toBe("active")
    expect(tony?.source.path?.replaceAll("\\", "/")).toContain("tony/plugin")
  }, 120_000)

  test("keeps its engine across app restarts when nothing changed", async () => {
    const before = service!.pid
    await quit()
    const { service: after, tony } = await launch()
    expect(after.pid).toBe(before)
    expect(tony?.state.status).toBe("active")
  }, 120_000)

  test("restarts an engine left running with other settings, here new options in tony.json", async () => {
    const before = service!.pid
    await quit()
    // XDG_CONFIG_HOME is <root>/config under a test root, so this is the user's opencode config folder.
    mkdirSync(join(root, "config", "opencode"), { recursive: true })
    writeFileSync(join(root, "config", "opencode", "tony.json"), JSON.stringify({ gate: { maxRounds: 2 } }))
    const { service: after, tony } = await launch((pid) => pid !== before)
    expect(after.pid).not.toBe(before)
    expect(tony?.state.status).toBe("active")
  }, 120_000)
})
