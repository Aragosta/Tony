// Spots changes that make tests easier to pass instead of making the code correct.

const TEST_DIR = /(^|\/)(test|tests|__tests__|spec)\//
const TEST_NAME = /(\.(test|spec)\.[^/]+$)|(_test\.(go|py)$)|((^|\/)test_[^/]*\.py$)/

export function isTestFile(path: string): boolean {
  return TEST_DIR.test(path) || TEST_NAME.test(path)
}

const CASES = /\b(?:test|it|describe)(?:\.each)?\s*\(|^\s*def test_|^\s*func Test|#\[test\]/gm
const SKIPS = /\.(?:skip|only)\s*\(|\bx(?:it|describe|test)\s*\(|@pytest\.mark\.(?:skip|xfail)|\bt\.Skip\(|#\[ignore\]/g
const ASSERTS = /\b(?:expect|assert)\w*\s*\(|\bassert\b/g
// Replacing what the code under test talks to (a global, an env var, a module) makes a test pass without the code working.
const MOCKS =
  /\b(?:vi|jest)\.(?:mock|doMock|spyOn|stubGlobal|stubEnv)\s*\(|\bmock\.module\s*\(|\bspyOn\s*\(|\bsinon\.(?:stub|mock|spy)\s*\(|\bmonkeypatch\.\w+\s*\(|@(?:mock\.)?patch\b|\b(?:globalThis|global|window)\.\w+\s*=(?!=)|\bprocess\.env\.\w+\s*=(?!=)|\bos\.environ\[[^\]]+\]\s*=(?!=)/g

const count = (re: RegExp, text: string) => text.match(re)?.length ?? 0

/** Findings for one test file; `null` content means the file does not exist. */
export function tamperFindings(path: string, before: string | null, after: string | null): string[] {
  if (before === null) return []
  if (after === null) return [`${path}: deleted`]
  const findings: string[] = []
  const cases = count(CASES, before) - count(CASES, after)
  if (cases > 0) findings.push(`${path}: ${cases} test case(s) removed`)
  if (count(SKIPS, after) > count(SKIPS, before)) findings.push(`${path}: skip or only marker added`)
  const asserts = count(ASSERTS, before) - count(ASSERTS, after)
  if (asserts > 0) findings.push(`${path}: ${asserts} assertion(s) removed`)
  const mocks = count(MOCKS, after) - count(MOCKS, before)
  if (mocks > 0) findings.push(`${path}: ${mocks} mock(s) or stub(s) added`)
  return findings
}

/** Files named in an opencode patch (`*** Add|Update|Delete File: <path>`). */
export function patchFiles(patchText: string): { kind: "add" | "update" | "delete"; path: string }[] {
  return [...patchText.matchAll(/^\*\*\* (Add|Update|Delete) File: (.+)$/gm)].map((m) => ({
    kind: m[1]!.toLowerCase() as "add" | "update" | "delete",
    path: m[2]!.trim(),
  }))
}
