// Tony: the opencode config the Tony app hands its engine. Tony's recommended config names the plugin with a
// placeholder; the app fills in where its copy of Tony's brain is installed, and the user's options from tony.json.
// No Electron imports, so it can be tested.

export const TONY_PLUGIN = "{TONY_PLUGIN}"

type Options = Record<string, unknown>
type Config = { plugins?: Array<{ package: string; options?: Options } & Record<string, unknown>> } & Record<string, unknown>

const isObject = (value: unknown): value is Options => typeof value === "object" && value !== null && !Array.isArray(value)

/** Merges the user's options into Tony's defaults: per feature (gate, loopGuard, ...), the user's keys win. */
function mergeOptions(defaults: Options = {}, user: Options = {}): Options {
  const merged: Options = { ...defaults }
  for (const [key, value] of Object.entries(user))
    merged[key] = isObject(value) && isObject(merged[key]) ? { ...merged[key], ...value } : value
  return merged
}

export function withPlugin<T extends Config>(
  config: T,
  pluginDir: string,
  userOptions?: Options,
): T & { plugins: NonNullable<Config["plugins"]> } {
  const plugins = config.plugins ?? []
  if (!plugins.some((plugin) => plugin.package === TONY_PLUGIN))
    throw new Error(`Tony's config has no ${TONY_PLUGIN} plugin entry`)
  return {
    ...config,
    plugins: plugins.map((plugin) =>
      plugin.package === TONY_PLUGIN
        ? { ...plugin, package: pluginDir, ...(userOptions ? { options: mergeOptions(plugin.options, userOptions) } : {}) }
        : plugin,
    ),
  }
}
