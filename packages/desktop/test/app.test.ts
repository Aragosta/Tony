// The built Tony app (bun run --cwd packages/desktop build) runs its own engine with Tony's brain loaded.
// Opt in: TONY_APP=1 bun test packages/desktop/test/app.test.ts (on Linux under xvfb-run).
import { afterAll, describe, expect, test } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const enabled = process.env.TONY_APP === "1"
const built = join(import.meta.dir, "../.build/app.json")
const TONY_PORT = 0x70e1

describe.skipIf(!enabled)("Tony app", () => {
  // OPENCODE_DESKTOP_TEST_ROOT points the app's data, config and state folders at a temporary root.
  const root = mkdtempSync(join(tmpdir(), "tony-app-"))
  let app: ChildProcess | undefined
  let service: { url: string; password: string; pid: number } | undefined

  afterAll(() => {
    if (service) process.kill(service.pid)
    app?.kill()
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  })

  test("starts its own engine with Tony's brain active", async () => {
    expect(existsSync(built)).toBe(true)
    const { executable } = JSON.parse(readFileSync(built, "utf8"))
    app = spawn(executable, process.platform === "linux" ? ["--no-sandbox"] : [], {
      env: { ...process.env, OPENCODE_DESKTOP_TEST_ROOT: root },
      stdio: "ignore",
    })

    // Tony registers its engine in its own state folder (userData is <root>/desktop under a test root).
    const registration = join(root, "desktop", "state", "opencode", "service.json")
    const deadline = Date.now() + 90_000
    while (!service && Date.now() < deadline) {
      if (existsSync(registration)) service = JSON.parse(readFileSync(registration, "utf8"))
      else await Bun.sleep(500)
    }
    expect(service).toBeDefined()
    expect(new URL(service!.url).port).toBe(String(TONY_PORT))
    // Nothing registered where a plain opencode looks (XDG_STATE_HOME is <root>/state under a test root).
    expect(existsSync(join(root, "state", "opencode", "service.json"))).toBe(false)

    // The engine registers before it has loaded config and plugins, so ask until Tony shows up or time runs out.
    type Plugin = { id: string; source: { type: string; path?: string }; state: { status: string } }
    let tony: Plugin | undefined
    while (tony?.state.status !== "active" && Date.now() < deadline) {
      const plugins: Plugin[] | undefined = await fetch(new URL("/api/plugin", service!.url), {
        headers: { authorization: `Basic ${btoa(`opencode:${service!.password}`)}` },
      })
        .then((response) => response.json())
        .then((body) => body.data)
        .catch(() => undefined)
      tony = plugins?.find((plugin) => plugin.id === "tony")
      if (tony?.state.status !== "active") await Bun.sleep(1000)
    }
    expect(tony?.state.status).toBe("active")
    expect(tony?.source.path?.replaceAll("\\", "/")).toContain("tony/plugin")
  }, 120_000)
})
