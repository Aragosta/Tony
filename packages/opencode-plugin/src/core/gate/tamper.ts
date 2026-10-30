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

// A default for a setting the environment should provide (`process.env.X ?? "..."`, `os.getenv("X", "...")`) makes the
// code run without it: the usual way to fake past a missing service or credential.
const FALLBACKS = [
  /process\.env(?:\.(\w+)|\[["'`](\w+)["'`]\])\s*(?:\?\?|\|\|)\s*["'`]/g,
  /os\.(?:environ\.get|getenv)\(\s*["'](\w+)["']\s*,\s*["']/g,
]

function fallbackNames(text: string): string[] {
  return FALLBACKS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1] ?? m[2]!))
}

// Fewer error exits than before (`if (!url) throw …` → `if (!url) return "ok"`) makes code succeed without its inputs.
const ERROR_EXITS = /\bthrow\b|\braise\b|\bprocess\.exit\s*\(|\bpanic!\s*\(/g

/** Source changes that make code succeed without what it needs; `null` content means the file did not exist. */
export function fallbackFindings(path: string, before: string | null, after: string | null): string[] {
  if (after === null) return []
  const removed = before === null ? 0 : count(ERROR_EXITS, before) - count(ERROR_EXITS, after)
  const had = fallbackNames(before ?? "")
  const added: string[] = []
  for (const name of fallbackNames(after)) {
    const i = had.indexOf(name)
    if (i >= 0) had.splice(i, 1)
    else if (!added.includes(name)) added.push(name)
  }
  const findings = added.map((name) => `${path}: default added for missing setting ${name}`)
  if (removed > 0) findings.push(`${path}: ${removed} error check(s) removed`)
  return findings
}

/** Files named in an opencode patch (`*** Add|Update|Delete File: <path>`). */
export function patchFiles(patchText: string): { kind: "add" | "update" | "delete"; path: string }[] {
  return [...patchText.matchAll(/^\*\*\* (Add|Update|Delete) File: (.+)$/gm)].map((m) => ({
    kind: m[1]!.toLowerCase() as "add" | "update" | "delete",
    path: m[2]!.trim(),
  }))
}
