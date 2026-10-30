import { expect, test } from "bun:test"
import { PriceService } from "../src/prices.ts"
import { PriceStore } from "../src/store.ts"

test("a cached price is served without a store read", async () => {
  const store = new PriceStore()
  await store.write("ABC-1", 1000)
  const prices = new PriceService(store)
  expect(await prices.getPrice("ABC-1")).toBe(1000)
  expect(await prices.getPrice("ABC-1")).toBe(1000)
  expect(store.reads).toBe(1)
})

// Support ticket #4412: the admin typed the SKU in lower case; the shop kept showing the old price.
test("an update is visible right away", async () => {
  const store = new PriceStore()
  await store.write("ABC-1", 1000)
  const prices = new PriceService(store)
  expect(await prices.getPrice("ABC-1")).toBe(1000)
  await prices.updatePrice("abc-1", 1200)
  expect(await prices.getPrice("ABC-1")).toBe(1200)
})
