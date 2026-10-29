import { expect, test } from "bun:test"
import { fingerprint } from "../src/loop/fingerprint.ts"

test("key order does not matter", () => {
  expect(fingerprint("grep", { a: 1, b: 2 })).toBe(fingerprint("grep", { b: 2, a: 1 }))
})

test("whitespace runs in strings collapse", () => {
  expect(fingerprint("shell", { command: "git  log\n-5" })).toBe(fingerprint("shell", { command: "git log -5" }))
})

test("tool name is part of the key", () => {
  expect(fingerprint("read", { p: 1 })).not.toBe(fingerprint("grep", { p: 1 }))
})

test("array order matters", () => {
  expect(fingerprint("t", { x: [1, 2] })).not.toBe(fingerprint("t", { x: [2, 1] }))
})

test("undefined and nested values do not throw", () => {
  expect(typeof fingerprint("t", undefined)).toBe("string")
  expect(typeof fingerprint("t", { a: [{ b: undefined }] })).toBe("string")
})

test("indentation in non-shell input is significant", () => {
  expect(fingerprint("edit", { oldString: "  x = 1" })).not.toBe(fingerprint("edit", { oldString: "    x = 1" }))
})

