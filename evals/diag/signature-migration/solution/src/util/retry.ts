import { request, type RequestOptions } from "../http/client.ts"

/** Sends a request, retrying failures up to `attempts` times in total. */
export async function withRetry(attempts: number, options: RequestOptions): Promise<unknown> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await request(options)
    } catch (e) {
      last = e
    }
  }
  throw last
}
