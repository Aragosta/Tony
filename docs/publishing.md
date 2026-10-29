# Publishing a release

Tony is published to npm as `@aragosta/tony`. opencode downloads it from npm when a user's config names it.

## First time
1. Create an npm account at npmjs.com. The scope `@aragosta` must be your npm username, or an npm organization you own (npmjs.com → Add Organization → `aragosta`).
2. Log in:
   ```bash
   npm login
   ```

## Each release
1. Make sure `main` is green in CI (Windows, macOS and Linux).
2. Bump the version in `packages/opencode-plugin/package.json`, add a `CHANGELOG.md` entry, and update the `@aragosta/tony@<version>` lines in `README.md`, `packages/opencode-plugin/README.md` and `config/opencode.json`.
3. Check what will be published (only `src/`, `README.md`, `LICENSE`, `package.json`):
   ```bash
   cd packages/opencode-plugin && npm pack --dry-run
   ```
4. Publish:
   ```bash
   npm publish
   ```
5. Tag the release:
   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```

## Check the published package
Add `"plugins": [{ "package": "@aragosta/tony@<version>" }]` to `~/.config/opencode/opencode.json` on a clean machine, run `opencode`, and ask "What's your name?". It should answer "Tony".

## Notes
- `@opencode/plugin` is an *optional peer* dependency. opencode supplies it to every plugin at runtime. Don't make it a regular or required dependency: npm would then download its whole tree (about 180 MB) on each user's first start.
- The eval always uses the plugin from the checkout, not the npm version.
