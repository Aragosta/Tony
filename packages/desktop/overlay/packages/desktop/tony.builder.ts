// Tony: opencode's electron-builder config with Tony's identity, Tony's brain in the resources, and no update feed
// (opencode's feed would replace Tony with OpenCode). Everything else, including the bundled engine, is opencode's.
import type { Configuration } from "electron-builder"
import { getConfig } from "./electron-builder.config"

const APP_ID = "ai.aragosta.tony"
const base = getConfig()
const { deb: _deb, rpm: _rpm, publish: _publish, ...rest } = base

const config: Configuration = {
  ...rest,
  appId: APP_ID,
  productName: "Tony",
  artifactName: "tony-${os}-${arch}.${ext}",
  extraMetadata: { ...base.extraMetadata, name: "tony", desktopName: `${APP_ID}.desktop`, version: process.env.TONY_VERSION ?? "0.1.0" },
  files: [...(base.files as string[]), "!resources/tony{,/**/*}"],
  extraResources: [...(base.extraResources as object[]), { from: "resources/tony", to: "tony" }],
  publish: null,
  mac: { ...base.mac, identity: null },
  linux: { ...base.linux, executableName: "tony", desktop: { entry: { StartupWMClass: APP_ID } } },
}

export default config
