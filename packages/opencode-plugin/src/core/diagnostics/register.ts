import { existsSync } from "node:fs"
import { extname, isAbsolute, join, relative, resolve } from "node:path"
import { patchFiles } from "../gate/tamper.ts"
import type { Host } from "../../host.ts"
import type { DiagnosticChecker, DiagnosticsOptions } from "../../options.ts"
import { onPath, shellQuote, toPosix } from "../../platform.ts"
import { exec, type Exec } from "../verify/exec.ts"
import { formatDiagnostics, newProblems, problemLines } from "./diff.ts"

const MUTATIONS = new Set(["edit", "write", "patch"])

export function checkerFor(path: string, checkers: readonly DiagnosticChecker[]): DiagnosticChecker | undefined {
  const ext = extname(path)
  return checkers.find((c) => c.extensions.includes(ext))
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
  // `${sessionID}\0${command}` -> problem lines at the last run; null = timed out, off for this session.
  // A project-wide checker (tsc) has one entry per session, so a signature change reports the errors in its callers.
  const last = new Map<string, string[] | null>()

  const check = async (sessionID: string, input: { tool: string; input: unknown }) => {
    const dir = (await host.sessionInfo(sessionID)).directory
    return touched(input.tool, input.input).flatMap((path) => {
      const rel = toPosix(relative(dir, isAbsolute(path) ? path : resolve(dir, path)))
      const checker = checkerFor(rel, opts.checkers)
      if (!checker || !available(checker, dir)) return []
      const command = checker.command.replaceAll("{file}", shellQuote(rel))
      return [{ rel, key: `${sessionID}\u0000${command}`, run: () => run(command, dir, opts.timeoutMs) }]
    })
  }

  await host.onToolBefore(async (e) => {
    if (!MUTATIONS.has(e.tool)) return
    for (const c of await check(e.sessionID, e)) {
      if (last.has(c.key)) continue
      const r = await c.run()
      last.set(c.key, r.timedOut ? null : problemLines(r.output))
    }
  })

  await host.onToolAfter(async (e) => {
    if (e.status !== "completed" || !MUTATIONS.has(e.tool)) return
    for (const c of await check(e.sessionID, e)) {
      const before = last.get(c.key)
      if (!before) continue
      const r = await c.run()
      const after = r.timedOut ? null : problemLines(r.output)
      last.set(c.key, after)
      if (!after) continue
      const fresh = newProblems(before, after)
      if (fresh.length > 0) e.append(formatDiagnostics(c.rel, fresh))
    }
  })
}
