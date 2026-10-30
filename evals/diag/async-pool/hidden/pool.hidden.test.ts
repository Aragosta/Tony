// Hidden from the agent: one or more cases per README rule, driven by hand-resolved promises (no timing).
import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mapLimit } from "../src/pool.ts"

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)))
  return { promise, resolve, reject }
}
/** Fails instead of hanging when `p` never settles (a swallowed error leaves the pool waiting forever). */
function settles<T>(p: Promise<T>, ms = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`did not settle within ${ms} ms`)), ms)))
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function controlled(n: number) {
  const calls = Array.from({ length: n }, () => deferred<number>())
  const started: number[] = []
  let running = 0
  let maxRunning = 0
  const fn = (_: unknown, i: number) => {
    started.push(i)
    running++
    maxRunning = Math.max(maxRunning, running)
    return calls[i]!.promise.finally(() => running--)
  }
  return { calls, started, fn, max: () => maxRunning }
}

// In a child process: a bad limit can make a batching loop spin forever (`start += 0`).
test("rule 1: a bad limit throws a RangeError synchronously", () => {
  const script = `
    import { mapLimit } from "./src/pool.ts"
    for (const limit of [0, -1, 1.5, NaN]) {
      let threw = false
      try { const p = mapLimit([1], limit, async (x) => x); p?.catch?.(() => {}) } catch (e) { threw = e instanceof RangeError }
      if (!threw) { console.log("no RangeError for limit " + limit); process.exit(1) }
    }`
  const r = spawnSync("bun", ["-e", script], { encoding: "utf8", timeout: 10_000 })
  expect(r.error ? "timed out: the call never returned" : (r.stdout + r.stderr).trim()).toBe("")
  expect(r.status).toBe(0)
})

test("rule 2: at most limit at once, and a slot refills as soon as one settles", async () => {
  const c = controlled(5)
  const all = mapLimit([0, 1, 2, 3, 4], 2, c.fn)
  await tick()
  expect(c.started).toEqual([0, 1])
  c.calls[1]!.resolve(1)
  await tick()
  // Item 0 is still running: no batch barrier.
  expect(c.started).toEqual([0, 1, 2])
  c.calls[2]!.resolve(2)
  await tick()
  expect(c.started).toEqual([0, 1, 2, 3])
  c.calls[0]!.resolve(0)
  c.calls[3]!.resolve(3)
  await tick()
  c.calls[4]!.resolve(4)
  expect(await settles(all)).toEqual([0, 1, 2, 3, 4])
  expect(c.max()).toBe(2)
})

test("rules 3 and 4: input order for starts and results", async () => {
  const c = controlled(4)
  const all = mapLimit(["a", "b", "c", "d"], 4, c.fn)
  await tick()
  expect(c.started).toEqual([0, 1, 2, 3])
  for (const i of [3, 1, 0, 2]) c.calls[i]!.resolve(i * 10)
  expect(await settles(all)).toEqual([0, 10, 20, 30])
})

test("rule 5: the first error rejects, and nothing new starts", async () => {
  const c = controlled(4)
  const all = mapLimit([0, 1, 2, 3], 1, c.fn)
  await tick()
  c.calls[0]!.reject(new Error("boom"))
  await expect(settles(all)).rejects.toThrow("boom")
  await tick()
  expect(c.started).toEqual([0])
})

test("rule 5: results of calls still running after a failure are ignored", async () => {
  const c = controlled(3)
  const all = mapLimit([0, 1, 2], 2, c.fn)
  await tick()
  c.calls[1]!.reject(new Error("second failed"))
  await expect(settles(all)).rejects.toThrow("second failed")
  c.calls[0]!.resolve(0)
  await tick()
  expect(c.started).toEqual([0, 1])
})

test("rule 6: empty input", async () => {
  let called = false
  expect(
    await mapLimit([], 3, async (x) => {
      called = true
      return x
    }),
  ).toEqual([])
  expect(called).toBe(false)
})

test("limit larger than the input, and the index argument", async () => {
  expect(await mapLimit(["x", "y"], 10, async (v, i) => `${v}${i}`)).toEqual(["x0", "y1"])
})
