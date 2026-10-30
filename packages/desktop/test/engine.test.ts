import { expect, test } from "bun:test"
import { fingerprint, isCurrent } from "../overlay/packages/desktop/src/main/tony/engine.ts"

const env = { OPENCODE_CONFIG_CONTENT: '{"plugins":[{"package":"/Applications/Tony.app/Contents/Resources/tony/plugin"}]}' }

test("the fingerprint changes with Tony's engine settings, such as a moved app or new options", () => {
  expect(fingerprint(env)).toBe(fingerprint({ ...env }))
  expect(fingerprint(env)).not.toBe(fingerprint({ OPENCODE_CONFIG_CONTENT: env.OPENCODE_CONFIG_CONTENT.replace("/Applications", "/tmp") }))
})

test("a running engine is current only if Tony started it with today's settings", () => {
  const wanted = fingerprint(env)
  expect(isCurrent({ pid: 42, fingerprint: wanted }, 42, wanted)).toBe(true)
  // An older Tony (no marker, or other settings) or a different process (marker left from an engine that exited).
  expect(isCurrent(undefined, 42, wanted)).toBe(false)
  expect(isCurrent({ pid: 42, fingerprint: "older" }, 42, wanted)).toBe(false)
  expect(isCurrent({ pid: 41, fingerprint: wanted }, 42, wanted)).toBe(false)
  expect(isCurrent({ pid: 42, fingerprint: wanted }, undefined, wanted)).toBe(false)
})
