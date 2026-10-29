import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const exists = (dir: string, name: string) => existsSync(join(dir, name))

function packageManager(dir: string): string {
  if (exists(dir, "bun.lock") || exists(dir, "bun.lockb")) return "bun"
  if (exists(dir, "pnpm-lock.yaml")) return "pnpm"
  if (exists(dir, "yarn.lock")) return "yarn"
  return "npm"
}

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
    return typeof script === "string" && !(name === "test" && script.includes("no test specified"))
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
