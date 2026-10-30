// Tony: the opencode config the Tony app hands its engine. Tony's recommended config names the plugin with a
// placeholder; the app fills in where its copy of Tony's brain is installed. No Electron imports, so it can be tested.

export const TONY_PLUGIN = "{TONY_PLUGIN}"

type Config = { plugins?: Array<{ package: string } & Record<string, unknown>> } & Record<string, unknown>

export function withPlugin<T extends Config>(config: T, pluginDir: string): T & { plugins: NonNullable<Config["plugins"]> } {
  const plugins = config.plugins ?? []
  if (!plugins.some((plugin) => plugin.package === TONY_PLUGIN))
    throw new Error(`Tony's config has no ${TONY_PLUGIN} plugin entry`)
  return { ...config, plugins: plugins.map((plugin) => (plugin.package === TONY_PLUGIN ? { ...plugin, package: pluginDir } : plugin)) }
}
