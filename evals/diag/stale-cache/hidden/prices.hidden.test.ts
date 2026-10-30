// Hidden from the agent. Copied into the workspace's test/ by the grader.
import { expect, test } from "bun:test"
import { TtlCache } from "../src/cache.ts"
import { PriceService } from "../src/prices.ts"
import { PriceStore } from "../src/store.ts"

async function shop(now = () => 0) {
  const store = new PriceStore()
  await store.write("ABC-1", 1000)
  await store.write("XY-9", 500)
  return { store, prices: new PriceService(store, now) }
}

test("update with stray spaces and lower case is visible", async () => {
  const { prices } = await shop()
  await prices.getPrice("ABC-1")
  await prices.updatePrice("  abc-1 ", 1300)
  expect(await prices.getPrice("ABC-1")).toBe(1300)
})

test("bulk import is visible right away (the CSV upload path)", async () => {
  const { prices } = await shop()
  await prices.getPrice("ABC-1")
  await prices.getPrice("XY-9")
  await prices.updatePrices([
    { sku: "abc-1", cents: 1111 },
    { sku: "xy-9 ", cents: 999 },
  ])
  expect(await prices.getPrice("ABC-1")).toBe(1111)
  expect(await prices.getPrice("xy-9")).toBe(999)
})

test("the cache still caches, across spellings of a SKU", async () => {
  const { store, prices } = await shop()
  await prices.getPrice("ABC-1")
  await prices.getPrice("abc-1")
  await prices.getPrice(" ABC-1")
  expect(store.reads).toBe(1)
})

test("updating one product keeps the others cached", async () => {
  const { store, prices } = await shop()
  await prices.getPrice("XY-9")
  await prices.updatePrice("abc-1", 1)
  await prices.getPrice("XY-9")
  expect(store.reads).toBe(1)
})

test("an entry expires exactly ttlMs after it was set", () => {
  let t = 0
  const cache = new TtlCache<number>(100, () => t)
  cache.set("k", 1)
  t = 99
  expect(cache.get("k")).toBe(1)
  t = 100
  expect(cache.get("k")).toBeUndefined()
})

test("prices refresh from the store after five minutes", async () => {
  let t = 0
  const { store, prices } = await shop(() => t)
  await prices.getPrice("ABC-1")
  await store.write("ABC-1", 2000)
  t = 5 * 60 * 1000
  expect(await prices.getPrice("ABC-1")).toBe(2000)
})

test("invalid prices are still rejected", async () => {
  const { prices } = await shop()
  await expect(prices.updatePrice("ABC-1", -1)).rejects.toThrow(RangeError)
  await expect(prices.updatePrices([{ sku: "ABC-1", cents: 1.5 }])).rejects.toThrow(RangeError)
})
