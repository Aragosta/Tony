import { expect, test } from "bun:test"
import { pageSizes } from "../src/crawl.ts"
import { mapLimit } from "../src/pool.ts"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test("results come back in input order", async () => {
  const out = await mapLimit([30, 10, 20], 3, async (ms) => {
    await sleep(ms)
    return ms
  })
  expect(out).toEqual([30, 10, 20])
})

test("page sizes line up with the urls", async () => {
  const pages: Record<string, string> = { a: "aaaa", b: "b", c: "cc" }
  const sizes = await pageSizes(["a", "b", "c"], async (url) => {
    await sleep(url === "a" ? 20 : 1)
    return pages[url]!
  })
  expect(sizes).toEqual([4, 1, 2])
})
