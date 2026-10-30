# Tony app build

The Tony app is opencode's desktop app at one pinned version, plus a few Tony changes, with Tony's brain (`packages/opencode-plugin`) always loaded. opencode's code isn't stored here. The build fetches it.

```bash
bun run --cwd packages/desktop build
```
This makes an unsigned app for the current OS and CPU. It writes the app location to `.build/app.json` and a tarball of the app to `.build/tony-<os>-<cpu>.tar`. `--source <dir>` reuses an opencode checkout instead of cloning.

What the build does:
1. Clones opencode at `opencode-version` (a sparse checkout of `packages/`).
2. Installs only the packages the desktop app needs (`src/source.ts`), with opencode's own catalog, overrides and dependency patches.
3. Applies `patches/`, then copies in `overlay/`.
4. Puts the pinned engine from npm (`@opencode/cli-<os>-<cpu>@<version>`) where opencode's build looks for a built CLI, so it is bundled unchanged. It's the same engine version the integration tests run.
5. Copies Tony's brain and `config/opencode.json` into the app's resources (`resources/tony/`).
6. Runs opencode's app build, then packs with `overlay/packages/desktop/tony.builder.ts`.

## Tony's changes to opencode
New files never conflict with an opencode update, so most of Tony lives in `overlay/`:
- `overlay/packages/desktop/src/main/tony/service.ts`: Tony's engine settings.
  - Own registration file and port (`0x70E1`), so the app never adopts a plain opencode service, which would run without Tony.
  - Own database (`tony.db`).
  - Tony's config in `OPENCODE_CONFIG_CONTENT`. The user's own opencode config still loads, and plugin lists are combined.
  - Only the engine process gets these variables.
- `overlay/packages/desktop/src/main/tony/config.ts`: fills the bundled plugin path into Tony's config. It refuses a config without Tony.
- `overlay/packages/desktop/tony.builder.ts`: opencode's electron-builder config with Tony's name and app ID (`ai.aragosta.tony`), Tony's resources, no update feed, and no macOS signing identity.

Edits to opencode's own files are kept to three small patches:

| Patch | File(s) | Why |
|---|---|---|
| `01-identity.patch` | `desktop/src/main/constants.ts` | Name "Tony" and app ID `ai.aragosta.tony`, so Tony has its own data folder and installs next to OpenCode |
| `02-tony-service.patch` | `desktop/src/main/service/background-service.ts`, `sidecar-probe.ts` | Start, find and adopt only Tony's own engine (hooks into `tony/service.ts`) |
| `03-updater-off.patch` | `gui-plugins/src/updater/main.ts` | opencode's update feed would replace Tony with OpenCode |

Everything else (screens, context meter, MCP status, terminal) is opencode's, unchanged.

## Updating opencode
1. Put the new version in `opencode-version`.
2. Bump `@opencode/plugin` in `packages/opencode-plugin/package.json`, and the opencode install in `.github/workflows/ci.yml`. `packages/eval/test/pins.test.ts` fails until all three match.
3. Run `bun install`, then the checks below. The `opencode-update` workflow does all of this daily and opens a PR.

If a patch no longer applies, the build stops and names it. To refresh it:
1. Run the build with `--source` on a fresh checkout of the new tag.
2. Make the same change by hand.
3. Regenerate the patch with `git diff -- <file> > patches/<name>.patch`.

## Checks
- `TONY_OPENCODE_BIN=<engine from .build/app.json> TONY_INTEGRATION=1 bun test packages/eval/test/integration` runs Tony's 12 feature tests against the engine inside the built app.
- `TONY_APP=1 bun test packages/desktop/test/app.test.ts` launches the built app (on Linux under `xvfb-run -a`) and checks that its own engine runs with Tony's brain active.
