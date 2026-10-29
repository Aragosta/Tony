// A scripted OpenAI-compatible model for integration tests: each request that offers tools gets the next step.
import { appendFileSync } from "node:fs"

export type Step = { tool: string; args: Record<string, unknown> } | { text: string }

function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((p) => (typeof p?.text === "string" ? p.text : JSON.stringify(p))).join("\n")
  return content === undefined || content === null ? "" : JSON.stringify(content)
}

const chunk = (id: string, delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`

export async function startMockLLM(script: Step[], logFile: string): Promise<{ url: string; stop(): void }> {
  const steps = [...script]
  let call = 0
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (new URL(req.url).pathname.endsWith("/models")) return Response.json({ object: "list", data: [{ id: "mock", object: "model" }] })
      const body: any = await req.json()
      const id = `c${++call}`
      const withTools = (body.tools ?? []).length > 0
      // Title and other tool-less requests don't consume the script.
      const step: Step = withTools ? (steps.shift() ?? { text: "done" }) : { text: "title" }
      if (withTools) {
        const last = (body.messages ?? []).slice(-4).map((m: any) => `${m.role}: ${textOf(m.content)}`)
        appendFileSync(logFile, JSON.stringify({ messages: last }) + "\n")
      }
      let out =
        "text" in step
          ? chunk(id, { role: "assistant", content: step.text }) + chunk(id, {}, "stop")
          : chunk(id, {
              role: "assistant",
              content: null,
              tool_calls: [{ index: 0, id: `call_${call}`, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.args) } }],
            }) + chunk(id, {}, "tool_calls")
      out += `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`
      out += "data: [DONE]\n\n"
      return new Response(out, { headers: { "content-type": "text/event-stream" } })
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) }
}
