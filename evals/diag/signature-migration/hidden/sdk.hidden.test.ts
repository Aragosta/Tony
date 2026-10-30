// Hidden from the agent: every helper must send exactly what it sent before the migration.
import { expect, test } from "bun:test"
import * as sdk from "../src/index.ts"
import type { Sent } from "../src/index.ts"

function record(fail = 0) {
  const sent: Sent[] = []
  sdk.setTransport(async (req) => {
    sent.push(req)
    if (fail-- > 0) throw new Error("503")
    return { ok: true }
  })
  return sent
}
const J = { accept: "application/json" }
const B = "https://api.acme.test"

const cases: [string, () => Promise<unknown>, Sent][] = [
  ["getUser", () => sdk.getUser("u1"), { method: "GET", url: `${B}/users/u1`, headers: J }],
  ["createUser", () => sdk.createUser("Ada", "a@x"), { method: "POST", url: `${B}/users`, body: { name: "Ada", email: "a@x" }, headers: J }],
  ["deleteUser", () => sdk.deleteUser("u1", "gdpr"), { method: "DELETE", url: `${B}/users/u1`, headers: { ...J, "x-reason": "gdpr" } }],
  ["listOrders", () => sdk.listOrders("u1", 3), { method: "GET", url: `${B}/users/u1/orders?page=3`, headers: J }],
  ["placeOrder", () => sdk.placeOrder("u1", [{ sku: "A", qty: 2 }], "k-1"), { method: "POST", url: `${B}/users/u1/orders`, body: { items: [{ sku: "A", qty: 2 }] }, headers: { ...J, "idempotency-key": "k-1" } }],
  ["cancelOrder", () => sdk.cancelOrder("o9"), { method: "POST", url: `${B}/orders/o9/cancel`, body: {}, headers: J }],
  ["getInvoice", () => sdk.getInvoice("i1"), { method: "GET", url: `${B}/invoices/i1`, headers: J }],
  ["downloadInvoice", () => sdk.downloadInvoice("i1"), { method: "GET", url: `${B}/invoices/i1/pdf`, headers: { accept: "application/pdf" } }],
  ["payInvoice", () => sdk.payInvoice("i1", 500), { method: "POST", url: `${B}/invoices/i1/payments`, body: { cents: 500 }, headers: J }],
  ["search", () => sdk.search("red shoes", { size: "42" }), { method: "GET", url: `${B}/search?q=red+shoes&size=42`, headers: J }],
  ["suggest", () => sdk.suggest("re d", "nl"), { method: "GET", url: `${B}/search/suggest?prefix=re%20d`, headers: { ...J, "accept-language": "nl" } }],
  ["setFeatureFlag", () => sdk.setFeatureFlag("beta", true, "t0k"), { method: "PUT", url: `${B}/admin/flags/beta`, body: { on: true }, headers: { ...J, authorization: "Bearer t0k" } }],
  ["rebuildIndex", () => sdk.rebuildIndex("t0k"), { method: "POST", url: `${B}/admin/index/rebuild`, body: {}, headers: { ...J, authorization: "Bearer t0k" } }],
]

for (const [name, call, expected] of cases) {
  test(`${name} sends the same request`, async () => {
    const sent = record()
    await call()
    expect(sent).toEqual([expected])
  })
}

test("rebuildIndex still retries, with the same request each time", async () => {
  const sent = record(2)
  await sdk.rebuildIndex("t0k")
  expect(sent).toHaveLength(3)
  expect(new Set(sent.map((s) => JSON.stringify(s))).size).toBe(1)
})

test("the old positional form throws a TypeError", () => {
  expect(() => sdk.request("GET" as never)).toThrow(TypeError)
})
