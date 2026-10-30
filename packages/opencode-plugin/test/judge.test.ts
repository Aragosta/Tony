import { expect, test } from "bun:test"
import { judgeMessage, judgePrompt, parseVerdict } from "../src/core/gate/judge.ts"

test("prompt lists checks", () => {
  expect(judgePrompt([{ command: "bun test", ok: false, output: "" }])).toContain("- bun test: failed")
  expect(judgePrompt([])).toContain("- none ran")
})

test("parses verdicts", () => {
  const v = { verdict: "continue", reason: "r", next_step: "n" }
  expect(parseVerdict(JSON.stringify(v))).toEqual(v as never)
  expect(parseVerdict(`Here is my verdict:\n${JSON.stringify(v)}`)).toEqual(v as never)
})

test("rejects junk", () => {
  expect(parseVerdict("sure!")).toBeUndefined()
  expect(parseVerdict('{"verdict":"maybe","reason":"x"}')).toBeUndefined()
  expect(parseVerdict('{"verdict":"done"}')).toBeUndefined()
})

test("message", () => {
  const m = judgeMessage({ verdict: "continue", reason: "R", next_step: "N" })
  expect(m).toContain("incomplete: R")
  expect(m).toContain("Next step: N")
})
