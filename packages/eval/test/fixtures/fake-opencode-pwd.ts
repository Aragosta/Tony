#!/usr/bin/env bun
// Like opencode, trusts $PWD (not the process cwd) for its working directory.
import { writeFileSync } from "node:fs"
writeFileSync(`${process.env.PWD}/done.txt`, "ok")
