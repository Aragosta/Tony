import { expect, test } from "bun:test"
import { fetchStatus } from "../src/api.ts"

test("service is healthy", async () => {
  expect(await fetchStatus()).toBe("ok")
})
