import { request } from "../http/client.ts"
import { withRetry } from "../util/retry.ts"

export const setFeatureFlag = (flag: string, on: boolean, token: string) =>
  request("PUT", `/admin/flags/${flag}`, { on }, { authorization: `Bearer ${token}` })

/** Flaky upstream: retried. */
export const rebuildIndex = (token: string) => withRetry(3, "POST", "/admin/index/rebuild", {}, { authorization: `Bearer ${token}` })
