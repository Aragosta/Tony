// One-command setup from a clone: `bun run setup [--npm] [--model llamacpp|ollama:<model>] [--dry-run] [--no-test]`.
// Installs opencode 2.2.1 when needed, adds Tony to the global opencode config (backed up first) and runs the
// real-opencode self-test. Works on macOS, Linux and Windows.
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { opencodeBinary } from "../../eval/src/opencode-bin.ts"
import { configFile, mergeTonyConfig, parseJsonc, providerBlock } from "./config.ts"

const OPENCODE_VERSION = "2.2.1"
const root = resolve(import.meta.dir, "../../..")
const { values: args } = parseArgs({
  options: {
    npm: { type: "boolean", default: false },
    model: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "no-test": { type: "boolean", default: false },
  },
})

const step = (text: string) => console.log(`\n▸ ${text}`)
function fail(text: string): never {
  console.error(`\n✗ ${text}`)
  process.exit(1)
}
// npm and opencode are .cmd shims on Windows, which only start through a shell.
const run = (command: string, opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) =>
  spawnSync(command, { shell: true, stdio: "inherit", ...opts }).status === 0
const output = (file: string, argv: string[]) => spawnSync(file, argv, { encoding: "utf8", shell: process.platform === "win32" }).stdout?.trim() ?? ""

step("Checking Node.js")
const node = output("node", ["--version"])
if (!/^v(1[89]|[2-9]\d)\./.test(node)) {
  fail(`Node.js 18 or newer is needed (found ${node || "none"}). macOS: \`brew install node\`; Windows: https://nodejs.org`)
}
console.log(`  node ${node}, bun ${Bun.version}`)

step("Installing Tony's dependencies")
if (!run(`"${process.execPath}" install`, { cwd: root })) fail("bun install failed")

step(`Checking opencode ${OPENCODE_VERSION}`)
const opencodeVersion = () => output(opencodeBinary(), ["--version"])
if (!opencodeVersion().includes(OPENCODE_VERSION)) {
  console.log(`  found ${opencodeVersion() || "none"}; installing @opencode/cli@${OPENCODE_VERSION}`)
  if (!run(`npm i -g @opencode/cli@${OPENCODE_VERSION}`) || !opencodeVersion().includes(OPENCODE_VERSION)) {
    fail(`could not install opencode ${OPENCODE_VERSION}. Try \`npm i -g @opencode/cli@${OPENCODE_VERSION}\` yourself (on macOS you may need sudo, or an npm prefix you own).`)
  }
}
console.log(`  ${opencodeVersion()}`)

step("Adding Tony to your opencode config")
const file = configFile(process.env, homedir(), existsSync)
const existing = existsSync(file) ? parseJsonc(readFileSync(file, "utf8")) : {}
const recommended = JSON.parse(readFileSync(join(root, "config/opencode.json"), "utf8"))
const pluginPath = args.npm ? recommended.plugins[0].package : join(root, "packages", "opencode-plugin")
const merged = mergeTonyConfig(existing, recommended, pluginPath)
let modelID: string | undefined
if (args.model) {
  const llamacpp = JSON.parse(readFileSync(join(root, "config/local-llamacpp.json"), "utf8")).providers
  let block: ReturnType<typeof providerBlock>
  try {
    block = providerBlock(args.model, llamacpp)
  } catch (e) {
    fail((e as Error).message)
  }
  // A provider you already configured wins.
  merged.providers = { ...block.providers, ...(merged.providers ?? {}) }
  merged.model ??= block.id
  modelID = block.id
}
if (args["dry-run"]) {
  console.log(`  would write ${file}:\n${JSON.stringify(merged, null, 2)}`)
  process.exit(0)
}
mkdirSync(dirname(file), { recursive: true })
if (existsSync(file)) {
  const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
  copyFileSync(file, backup)
  console.log(`  backed up your config to ${backup}`)
}
writeFileSync(file, JSON.stringify(merged, null, 2) + "\n")
console.log(`  ${file}: plugin ${pluginPath}${modelID ? `, model ${merged.model}` : ""}`)

if (!args["no-test"]) {
  step("Self-test: real opencode + Tony with a scripted model (about a minute)")
  if (!run(`"${process.execPath}" test packages/eval/test/integration`, { cwd: root, env: { ...process.env, TONY_INTEGRATION: "1" } })) {
    fail("the self-test failed; see the output above. On Windows it needs Git Bash on PATH.")
  }
}

console.log(`\n✓ opencode ${OPENCODE_VERSION} with Tony is set up.`)
console.log(`  Next: in a project, run \`opencode${modelID ? ` --model ${modelID}` : ""}\` and ask "What's your name?" It answers "Tony".`)
if (!modelID) console.log("  No model configured by setup; for a local model rerun with --model llamacpp or --model ollama:<model> (see README).")
