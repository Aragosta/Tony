import { accessSync, constants, existsSync } from "node:fs"
import { delimiter, extname, isAbsolute, join, relative, resolve } from "node:path"
import { patchFiles } from "../gate/tamper.ts"
import type { Host } from "../host.ts"
import type { DiagnosticChecker, DiagnosticsOptions } from "../options.ts"
import { exec, type Exec } from "../verify/exec.ts"
import { formatDiagnostics, newProblems, relevantLines } from "./diff.ts"

const MUTATIONS = new Set(["edit", "write", "patch"])

export function checkerFor(path: string, checkers: readonly DiagnosticChecker[]): DiagnosticChecker | undefined {
  const ext = extname(path)
  return checkers.find((c) => c.extensions.includes(ext))
}

function onPath(command: string): boolean {
  return (process.env.PATH ?? "").split(delimiter).some((d) => {
    try {
      accessSync(join(d, command), constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

/** `requires` is a project-relative path when it contains a slash, otherwise a command on PATH. */
export function available(checker: DiagnosticChecker, dir: string): boolean {
  return checker.requires.includes("/") ? existsSync(join(dir, checker.requires)) : onPath(checker.requires)
}

function touched(tool: string, input: unknown): string[] {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === "patch") return typeof i.patchText === "string" ? patchFiles(i.patchText).map((f) => f.path) : []
  return typeof i.path === "string" ? [i.path] : []
}

export async function registerDiagnostics(host: Host, opts: DiagnosticsOptions, run: Exec = exec): Promise<void> {
  if (!opts.enabled) return
  // `${sessionID}\0${file}` -> problem lines before the session's first edit of the file; null = baseline unusable
  const baselines = new Map<string, string[] | null>()

  const check = async (sessionID: string, input: { tool: string; input: unknown }) => {
    const dir = (await host.sessionInfo(sessionID)).directory
    return touched(input.tool, input.input).flatMap((path) => {
      const rel = relative(dir, isAbsolute(path) ? path : resolve(dir, path))
      const checker = checkerFor(rel, opts.checkers)
      if (!checker || !available(checker, dir)) return []
      const command = checker.command.replaceAll("{file}", JSON.stringify(rel))
      return [{ rel, key: `${sessionID}\u0000${rel}`, run: () => run(command, dir, opts.timeoutMs) }]
    })
  }

  await host.onToolBefore(async (e) => {
    if (!MUTATIONS.has(e.tool)) return
    for (const c of await check(e.sessionID, e)) {
      if (baselines.has(c.key)) continue
      const r = await c.run()
      baselines.set(c.key, r.timedOut ? null : relevantLines(r.output, c.rel))
    }
  })

  await host.onToolAfter(async (e) => {
    if (e.status !== "completed" || !MUTATIONS.has(e.tool)) return
    for (const c of await check(e.sessionID, e)) {
      const before = baselines.get(c.key)
      if (!before) continue
      const r = await c.run()
      if (r.timedOut) continue
      const fresh = newProblems(before, relevantLines(r.output, c.rel))
      if (fresh.length > 0) e.append(formatDiagnostics(c.rel, fresh))
    }
  })
}
