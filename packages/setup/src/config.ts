// The pure part of setup: where opencode's global config lives and how Tony is merged into it.
import { join } from "node:path"

export type Config = Record<string, any>

/** opencode's global config file: $OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode, else ~/.config/opencode. */
export function configFile(env: NodeJS.ProcessEnv, home: string, exists: (path: string) => boolean): string {
  const dir = env.OPENCODE_CONFIG_DIR || join(env.XDG_CONFIG_HOME || join(home, ".config"), "opencode")
  const jsonc = join(dir, "opencode.jsonc")
  return exists(jsonc) ? jsonc : join(dir, "opencode.json")
}

/** JSON with comments and trailing commas, as opencode accepts. */
export function parseJsonc(text: string): Config {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') {
      // Copy the whole string, escapes included, so "//" inside it is not a comment.
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      out += "\n"
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2)
      if (i < 0) break
      i++
    } else out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}

/** A Tony entry from any install: the npm package, or a checkout's packages/opencode-plugin. */
const isTony = (pkg: unknown) =>
  typeof pkg === "string" && (/^@aragosta\/tony(@|$)/.test(pkg) || /[\\/]packages[\\/]opencode-plugin[\\/]?$/.test(pkg))

/**
 * Adds Tony (first, as `pluginPath`) to an existing config, keeping everything the user set: their other plugins,
 * settings and agent fields win; recommended defaults only fill gaps. An older Tony entry is replaced, keeping its options.
 */
export function mergeTonyConfig(existing: Config, recommended: Config, pluginPath: string): Config {
  const plugins: Config[] = Array.isArray(existing.plugins) ? existing.plugins : []
  const old = plugins.find((p) => isTony(p?.package))
  const agents: Config = { ...(existing.agents ?? {}) }
  for (const [name, defaults] of Object.entries<Config>(recommended.agents ?? {})) agents[name] = { ...defaults, ...(agents[name] ?? {}) }
  return {
    $schema: recommended.$schema,
    ...existing,
    plugins: [{ package: pluginPath, options: old?.options ?? {} }, ...plugins.filter((p) => !isTony(p?.package))],
    experimental: { ...(recommended.experimental ?? {}), ...(existing.experimental ?? {}) },
    agents,
  }
}

/**
 * The provider block for `--model`: `llamacpp` uses the repo's config/local-llamacpp.json; `ollama:<model>` points
 * an OpenAI-compatible provider at the local Ollama server. Returns the `provider/model` id to run with.
 */
export function providerBlock(model: string, llamacppProviders: Config): { id: string; providers: Config } {
  if (model === "llamacpp") return { id: "llamacpp/local", providers: llamacppProviders }
  const name = model.startsWith("ollama:") ? model.slice("ollama:".length) : ""
  if (!name) throw new Error(`--model must be "llamacpp" or "ollama:<model>" (for example ollama:qwen3-coder:30b), not "${model}"`)
  return {
    id: `ollama/${name}`,
    providers: {
      ollama: {
        name: "Ollama",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: "http://127.0.0.1:11434/v1" },
        models: { [name]: { name, capabilities: { tools: true }, limit: { context: 131072, output: 16384 } } },
      },
    },
  }
}
