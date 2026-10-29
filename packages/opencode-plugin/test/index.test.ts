import { expect, test } from "bun:test"

test("default export is a tony plugin", async () => {
  const plugin = (await import("../src/index.ts")).default
  expect(plugin.id).toBe("tony")
  expect(typeof plugin.setup).toBe("function")
})
