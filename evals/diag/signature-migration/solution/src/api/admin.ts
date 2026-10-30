import { request } from "../http/client.ts"
import { withRetry } from "../util/retry.ts"

export const setFeatureFlag = (flag: string, on: boolean, token: string) =>
  request({ method: "PUT", url: `/admin/flags/${flag}`, body: { on }, headers: { authorization: `Bearer ${token}` } })

/** Flaky upstream: retried. */
export const rebuildIndex = (token: string) => withRetry(3, { method: "POST", url: "/admin/index/rebuild", body: {}, headers: { authorization: `Bearer ${token}` } })
