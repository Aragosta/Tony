import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const exists = (dir: string, name: string) => existsSync(join(dir, name))

function packageManager(dir: string): string {
  if (exists(dir, "bun.lock") || exists(dir, "bun.lockb")) return "bun"
  if (exists(dir, "pnpm-lock.yaml")) return "pnpm"
  if (exists(dir, "yarn.lock")) return "yarn"
  return "npm"
}

// The gate must not rewrite files behind the agent's back or wait on a watcher.
const UNSAFE_SCRIPT = /--fix\b|--write\b|--watch\b|(^|\s)-w(\s|$)/

function nodeChecks(dir: string): string[] | undefined {
  if (!exists(dir, "package.json")) return undefined
  let scripts: Record<string, unknown> = {}
  try {
    scripts = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts ?? {}
  } catch {
    return undefined
  }
  const pm = packageManager(dir)
  const found = ["typecheck", "lint", "test"].filter((name) => {
    const script = scripts[name]
    return typeof script === "string" && !UNSAFE_SCRIPT.test(script) && !(name === "test" && script.includes("no test specified"))
  })
  return found.length > 0 ? found.map((name) => `${pm} run ${name}`) : undefined
}

function hasPythonTests(dir: string): boolean {
  if (exists(dir, "tests")) return true
  const testFile = (d: string) => {
    try {
      return readdirSync(d).some((f) => /^test_.*\.py$/.test(f))
    } catch {
      return false
    }
  }
  if (testFile(dir)) return true
  return readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && testFile(join(dir, e.name)))
}

/**
 * One spelling per check, so a run the agent did can stand in for the gate's own: whitespace collapsed, and a package
 * script is `run <name>` whichever manager runs it (`npm test` too; `bun test` is bun's own runner, not the script).
 */
export function normalizeCheck(command: string): string {
  return command
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:npm|pnpm|yarn) test\b/, "run test")
    .replace(/^(?:npm|pnpm|yarn|bun) run (?=\S)/, "run ")
}

/** Normalized commands that count as running `command`: itself, plus the script's body for a package script. */
export function checkAliases(command: string, dir: string): string[] {
  const own = normalizeCheck(command)
  const name = /^run (\S+)$/.exec(own)?.[1]
  if (!name) return [own]
  try {
    const script = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.[name]
    return typeof script === "string" ? [own, normalizeCheck(script)] : [own]
  } catch {
    return [own]
  }
}

/** The project's own checks, from the first ecosystem found. Empty when nothing is detected. */
export function detectChecks(dir: string): string[] {
  const node = nodeChecks(dir)
  if (node) return node
  if (exists(dir, "Cargo.toml")) return ["cargo test --quiet"]
  if (exists(dir, "go.mod")) return ["go build ./... && go test ./..."]
  if ((exists(dir, "pyproject.toml") || exists(dir, "setup.cfg") || exists(dir, "pytest.ini")) && hasPythonTests(dir)) {
    return ["python -m pytest -q"]
  }
  if (exists(dir, "Makefile") && /^test:/m.test(readFileSync(join(dir, "Makefile"), "utf8"))) return ["make test"]
  return []
}
