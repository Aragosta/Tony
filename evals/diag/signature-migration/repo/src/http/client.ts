import { send } from "./transport.ts"

const BASE = "https://api.acme.test"

/** Sends one API request. `url` is relative to the API base. */
export function request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<unknown> {
  return send({ method, url: BASE + url, ...(body === undefined ? {} : { body }), headers: { accept: "application/json", ...headers } })
}
