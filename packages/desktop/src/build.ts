#!/usr/bin/env bun
// Builds the Tony app: opencode's desktop app at the pinned version (opencode-version), plus Tony's patches
// (patches/), Tony's new files (overlay/), the pinned opencode engine from npm and Tony's brain
// (packages/opencode-plugin). Unsigned, for the current OS and CPU.
//   bun run --cwd packages/desktop build [--source <opencode checkout>]
// --source reuses a checkout instead of cloning; every step is safe to repeat on it.
import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { narrowRoot, type Workspaces } from "./source.ts"

const here = resolve(import.meta.dir, "..")
const repo = resolve(here, "../..")
const version = readFileSync(join(here, "opencode-version"), "utf8").trim()
const { values: args } = parseArgs({ options: { source: { type: "string" } } })
const work = join(here, ".build")
const source = args.source ? resolve(args.source) : join(work, "opencode")
const desktop = join(source, "packages", "desktop")
const step = (text: string) => console.log(`\n▸ ${text}`)
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
mkdirSync(work, { recursive: true })

if (!args.source) {
  step(`Fetching opencode v${version}`)
  rmSync(source, { recursive: true, force: true })
  await $`git -c advice.detachedHead=false clone --quiet --depth 1 --branch v${version} --filter=blob:none --sparse https://github.com/anomalyco/opencode ${source}`
  // Interpolated, so Bun's shell passes the patterns to git instead of expanding them as file globs.
  const patterns = ["/*", "/packages/"]
  await $`git -C ${source} sparse-checkout set --no-cone ${patterns}`
}

step("Limiting the install to the packages the desktop app needs")
const workspaces: Workspaces = {}
for (const pattern of ["packages/*/package.json", "packages/*/*/package.json"])
  for (const file of new Bun.Glob(pattern).scanSync({ cwd: source })) {
    const manifest = readJson(join(source, file))
    if (manifest.name) workspaces[manifest.name] = { dir: dirname(file).replaceAll("\\", "/"), manifest }
  }
const rootFile = join(source, "package.json")
const root = narrowRoot(readJson(rootFile), workspaces, ["@opencode/desktop"])
writeFileSync(rootFile, JSON.stringify(root, null, 2) + "\n")
console.log(`  ${root.workspaces.packages.join(", ")}`)

step("Applying Tony's patches")
for (const patch of readdirSync(join(here, "patches")).filter((file) => file.endsWith(".patch")).sort()) {
  const file = join(here, "patches", patch)
  if ((await $`git -C ${source} apply --reverse --check ${file}`.nothrow().quiet()).exitCode === 0) {
    console.log(`  ${patch}: already applied`)
    continue
  }
  if ((await $`git -C ${source} apply ${file}`.nothrow()).exitCode !== 0)
    throw new Error(`${patch} no longer applies to opencode v${version}; refresh it against the file named above (packages/desktop/README.md)`)
  console.log(`  ${patch}`)
}
cpSync(join(here, "overlay"), source, { recursive: true })

step("Installing dependencies")
await $`bun install`.cwd(source)

step(`Bundling the opencode ${version} engine from npm`)
const { getCurrentCli } = await import(join(desktop, "script", "utils.ts"))
const cli: { package: string; os: string; cpu: string } = getCurrentCli()
const download = mkdtempSync(join(tmpdir(), "tony-engine-"))
writeFileSync(join(download, "package.json"), "{}")
await $`bun add --no-save ${`${cli.package}@${version}`} ${`--os=${cli.os}`} ${`--cpu=${cli.cpu}`}`.cwd(download)
// opencode's build bundles the engine it finds in packages/cli/dist instead of a source build.
const engineDir = join(source, "packages", "cli", "dist", cli.package.replace("@opencode/", ""))
rmSync(engineDir, { recursive: true, force: true })
cpSync(join(download, "node_modules", cli.package), engineDir, { recursive: true })
rmSync(download, { recursive: true, force: true })
console.log(`  ${cli.package}@${version}`)

step("Adding Tony's brain")
const tony = join(desktop, "resources", "tony")
const plugin = join(repo, "packages", "opencode-plugin")
rmSync(tony, { recursive: true, force: true })
cpSync(join(plugin, "src"), join(tony, "plugin", "src"), { recursive: true })
cpSync(join(plugin, "package.json"), join(tony, "plugin", "package.json"))
cpSync(join(repo, "config", "opencode.json"), join(tony, "opencode.json"))

const env = { ...process.env, OPENCODE_CHANNEL: "prod" }
step("Building the app")
await $`bun run build`.cwd(desktop).env(env)

step("Packing")
const os = cli.os === "darwin" ? "mac" : cli.os === "win32" ? "win" : "linux"
rmSync(join(desktop, "dist"), { recursive: true, force: true })
await $`bunx electron-builder ${`--${os}`} ${`--${cli.cpu}`} --publish never --dir --config tony.builder.ts`.cwd(desktop).env(env)

const dist = join(desktop, "dist")
const arm = cli.cpu === "arm64"
const app = os === "mac" ? join(dist, arm ? "mac-arm64" : "mac", "Tony.app") : join(dist, `${os}-${arm ? "arm64-" : ""}unpacked`)
const resources = os === "mac" ? join(app, "Contents", "Resources") : join(app, "resources")
const built = {
  opencode: version,
  app,
  executable: os === "mac" ? join(app, "Contents", "MacOS", "Tony") : join(app, os === "win" ? "Tony.exe" : "tony"),
  engine: join(resources, os === "win" ? "opencode-cli.exe" : "opencode-cli"),
  brain: join(resources, "tony", "plugin", "src", "index.ts"),
  config: join(resources, "tony", "opencode.json"),
  archive: join(work, `tony-${os}-${cli.cpu}.tar`),
}
for (const file of [built.executable, built.engine, built.brain, built.config])
  if (!existsSync(file)) throw new Error(`The packed app is missing ${file}`)
// Unsigned: Apple-silicon Macs refuse a bundle whose signature no longer matches, so sign it ad hoc.
if (os === "mac") await $`codesign --force --deep --sign - ${app}`
// A tarball keeps the .app bundle's symlinks and permissions intact.
await $`tar -cf ${built.archive} -C ${dirname(app)} ${app.slice(dirname(app).length + 1)}`
writeFileSync(join(work, "app.json"), JSON.stringify(built, null, 2) + "\n")
console.log(`\n✓ Tony app (opencode ${version}): ${app}\n  engine: ${built.engine}\n  archive: ${built.archive}`)
