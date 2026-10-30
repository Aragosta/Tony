import { request } from "../http/client.ts"

export function search(query: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ q: query, ...filters })
  return request({ method: "GET", url: `/search?${params}` })
}

export function suggest(prefix: string, locale: string) {
  return request({ method: "GET", url: `/search/suggest?prefix=${encodeURIComponent(prefix)}`, headers: { "accept-language": locale } })
}
