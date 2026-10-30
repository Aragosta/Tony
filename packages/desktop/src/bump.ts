#!/usr/bin/env bun
// Moves Tony to another opencode version: the app's pin (which CI installs too) and the plugin's @opencode/plugin
// pin. `bun packages/desktop/src/bump.ts <version>`, then `bun install`. packages/eval/test/pins.test.ts checks they
// agree.
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

type Manifest = Record<string, any>

function checked(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`not a plain x.y.z opencode version: ${version}`)
  return version
}

export function bumpPlugin(manifest: Manifest, version: string): Manifest {
  checked(version)
  return {
    ...manifest,
    peerDependencies: { ...manifest.peerDependencies, "@opencode/plugin": version },
    devDependencies: { ...manifest.devDependencies, "@opencode/plugin": version },
  }
}

if (import.meta.main) {
  const version = checked(process.argv[2] ?? "")
  const repo = resolve(import.meta.dir, "../../..")
  const at = (path: string) => join(repo, path)
  writeFileSync(at("packages/desktop/opencode-version"), version + "\n")
  const plugin = at("packages/opencode-plugin/package.json")
  writeFileSync(plugin, JSON.stringify(bumpPlugin(JSON.parse(readFileSync(plugin, "utf8")), version), null, 2) + "\n")
  console.log(`opencode ${version}: packages/desktop/opencode-version, packages/opencode-plugin/package.json`)
}
