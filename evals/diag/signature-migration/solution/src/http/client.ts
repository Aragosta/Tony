import { send } from "./transport.ts"

const BASE = "https://api.acme.test"

export interface RequestOptions {
  method: string
  /** Relative to the API base. */
  url: string
  body?: unknown
  headers?: Record<string, string>
}

/** Sends one API request. */
export function request(options: RequestOptions): Promise<unknown> {
  if (typeof options !== "object" || options === null) throw new TypeError("request takes an options object: request({ method, url, body, headers })")
  const { method, url, body, headers = {} } = options
  return send({ method, url: BASE + url, ...(body === undefined ? {} : { body }), headers: { accept: "application/json", ...headers } })
}
