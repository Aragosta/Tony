import { request } from "../http/client.ts"

export function search(query: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ q: query, ...filters })
  return request("GET", `/search?${params}`)
}

export function suggest(prefix: string, locale: string) {
  return request("GET", `/search/suggest?prefix=${encodeURIComponent(prefix)}`, undefined, { "accept-language": locale })
}
