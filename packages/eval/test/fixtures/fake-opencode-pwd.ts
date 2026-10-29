#!/usr/bin/env bun
// Like opencode, trusts $PWD (not the process cwd) for its working directory, and reads its global config from
// $XDG_CONFIG_HOME/opencode. Records the global config it saw in ./global-seen.json.
import { copyFileSync, existsSync, writeFileSync } from "node:fs"
const dir = process.env.PWD
writeFileSync(`${dir}/done.txt`, "ok")
const global = `${process.env.XDG_CONFIG_HOME}/opencode/opencode.json`
if (existsSync(global)) copyFileSync(global, `${dir}/global-seen.json`)
