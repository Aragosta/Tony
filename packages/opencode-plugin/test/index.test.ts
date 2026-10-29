import { expect, test } from "bun:test"

test("default export is a tony plugin", async () => {
  const plugin = (await import("../src/index.ts")).default
  expect(plugin.id).toBe("tony")
  expect(typeof plugin.setup).toBe("function")
})

function fakeCtx(context: unknown[] = []) {
  const hooks = new Map<string, (e: any) => unknown>()
  const ctx = {
    tool: { hook: async (name: string, cb: (e: any) => unknown) => void hooks.set(`tool:${name}`, cb) },
    session: {
      hook: async (name: string, cb: (e: any) => unknown) => void hooks.set(`session:${name}`, cb),
      context: async () => context,
    },
  }
  return { ctx, hooks }
}

test("append writes into the real result", async () => {
  const { createHost } = await import("../src/index.ts")
  for (const [content, check] of [
    ["A", (c: unknown) => expect(c).toBe("AB")],
    [[{ type: "text", text: "A" }], (c: unknown) => expect(c).toEqual([{ type: "text", text: "A" }, { type: "text", text: "B" }])],
  ] as const) {
    const { ctx, hooks } = fakeCtx()
    await createHost(ctx as never).onToolAfter((e) => {
      if (e.status === "completed") e.append("B")
    })
    const event = { tool: "edit", sessionID: "s", input: {}, status: "completed", result: { content } }
    await hooks.get("tool:execute.after")!(event)
    check(event.result.content)
  }
})

test("transcript maps messages", async () => {
  const { createHost } = await import("../src/index.ts")
  const { ctx } = fakeCtx([
    { type: "user", text: "hi" },
    {
      type: "assistant",
      content: [
        { type: "text", text: "Done." },
        { type: "tool", name: "edit" },
      ],
      snapshot: { files: ["a.ts"] },
    },
    { type: "system", text: "x" },
  ])
  expect(await createHost(ctx as never).transcript("s")).toEqual([
    { type: "user", text: "hi" },
    { type: "assistant", text: "Done.", tools: ["edit"], files: ["a.ts"] },
  ])
})
