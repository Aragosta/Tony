// Pure helpers for preparing opencode's source: which workspace packages the desktop app needs, and a root manifest
// that installs only those.

export type Manifest = Record<string, any>
export type Workspaces = Record<string, { dir: string; manifest: Manifest }>

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]

function workspaceDependencies(manifest: Manifest): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries((manifest[field] ?? {}) as Record<string, string>)
      .filter(([, spec]) => String(spec).startsWith("workspace:"))
      .map(([name]) => name),
  )
}

/** Directories of `roots` and every workspace package they depend on, sorted. */
export function workspaceClosure(workspaces: Workspaces, roots: string[]): string[] {
  const seen = new Set<string>()
  const pending = [...roots]
  while (pending.length) {
    const name = pending.pop()!
    if (seen.has(name)) continue
    const found = workspaces[name]
    if (!found) throw new Error(`opencode's source has no workspace package ${name}`)
    seen.add(name)
    pending.push(...workspaceDependencies(found.manifest))
  }
  return [...seen].map((name) => workspaces[name]!.dir).sort()
}

/**
 * opencode's root manifest, limited to the packages `roots` need (plus the root's own workspace dependencies). The
 * catalog, overrides and dependency patches stay, so versions match upstream; install hooks for packages that are
 * not there are dropped.
 */
export function narrowRoot(root: Manifest, workspaces: Workspaces, roots: string[]): Manifest {
  const { postinstall: _postinstall, prepare: _prepare, ...scripts } = root.scripts ?? {}
  return {
    ...root,
    scripts,
    workspaces: { ...root.workspaces, packages: workspaceClosure(workspaces, [...roots, ...workspaceDependencies(root)]) },
  }
}
