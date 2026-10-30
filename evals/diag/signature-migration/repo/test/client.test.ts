import { expect, test } from "bun:test"
import { createUser, getUser, request, setTransport, type Sent } from "../src/index.ts"

function record() {
  const sent: Sent[] = []
  setTransport(async (req) => (sent.push(req), { ok: true }))
  return sent
}

// The new signature: one options object.
test("request takes an options object", async () => {
  const sent = record()
  await request({ method: "PATCH", url: "/users/7", body: { name: "Ada" }, headers: { "x-trace": "1" } })
  expect(sent).toEqual([{ method: "PATCH", url: "https://api.acme.test/users/7", body: { name: "Ada" }, headers: { accept: "application/json", "x-trace": "1" } }])
})

test("the old positional form is rejected", () => {
  expect(() => request("GET" as never, "/users/1" as never)).toThrow(TypeError)
})

test("api helpers still send the same requests", async () => {
  const sent = record()
  await getUser("1")
  await createUser("Ada", "ada@example.com")
  expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual(["GET https://api.acme.test/users/1", "POST https://api.acme.test/users"])
  expect(sent[1]!.body).toEqual({ name: "Ada", email: "ada@example.com" })
})
