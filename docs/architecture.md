# Tony architecture

```
Tony app      opencode's desktop app at one pinned version + Tony's patches and files   packages/desktop
  └─ engine   opencode CLI from npm, same pinned version, Tony's own instance             packages/desktop/opencode-version
       └─ brain   Tony's plugin, always loaded                                          packages/opencode-plugin
```

**Brain (`packages/opencode-plugin`).** All of Tony's behaviour lives here: completion gate, loop guard, edit guard, diagnostics, prompt, local context and judge.
- Only `src/index.ts` touches opencode's plugin API. Everything else goes through the `Host` interface, so a plugin API change is a one-file fix.
- The brain doesn't know it runs inside an app.

**Engine.** The opencode CLI from npm at the pinned version, unchanged. It's bundled in the app, and the integration tests and the eval run this same version.

The app starts **its own** engine, so Tony never runs without its brain and never shares state with a plain opencode:

| What | Tony's engine | Why |
|---|---|---|
| Registration and state folder | the app's own data folder | the app never adopts a plain opencode service (no brain), and opencode never adopts Tony's |
| Port | `0x70E1` | opencode's own service uses `0xC0DE` (`0x70DE` on Windows) |
| Database | `tony.db` | two services never share one session database |
| Config | `OPENCODE_CONFIG_CONTENT` = `config/opencode.json` with the bundled brain's path filled in | the brain and Tony's defaults are always on |

The user's own opencode config (models, providers, MCP servers) still loads, and plugin lists are combined.

**App (`packages/desktop`).** opencode's desktop app (screens, context meter, MCP status, terminal), built from opencode's source at the pinned version. opencode's code isn't stored in this repo. `src/build.ts`:
1. clones the tag;
2. installs only the packages the app needs;
3. applies Tony's 3 small patches;
4. copies in Tony's new files (`overlay/`);
5. bundles the pinned engine and the brain;
6. packs an unsigned app.

Details: `packages/desktop/README.md`.

## How opencode updates come in
1. **`opencode-update` workflow (daily, or by hand).**
   - Picks up a new `@opencode/cli` on npm.
   - Bumps `packages/desktop/opencode-version` and the brain's `@opencode/plugin` pin (`packages/desktop/src/bump.ts`) on a branch.
   - Runs the full CI there.
   - Opens a PR that says whether it passed.
2. **CI on that branch:**
   - builds the app on macOS, Windows and Linux;
   - runs the brain's 12 feature tests against the engine **inside the built app**;
   - launches the app and checks that its own engine runs with the brain active.
3. **Green:** merge. **Red:** the failing step names what to fix.
   - A **patch** that no longer applies: refresh it (packages/desktop/README.md).
   - A **plugin API change**: fix `src/index.ts`.
   - A **behaviour change**: the failing feature test names it.

Tony's changes to opencode's own files are three patches of about 15 lines. Everything else Tony adds is new files, which never conflict, so most updates need no hand work.

## What every change must keep working
- `bun test` and `bun run typecheck`.
- `TONY_INTEGRATION=1 bun test packages/eval/test/integration` (12 feature tests against real opencode). CI also runs it against the app's bundled engine.
- `TONY_APP=1 bun test packages/desktop/test/app.test.ts` (the app launches, with the brain active).
