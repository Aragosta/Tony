import { mapLimit } from "./pool.ts"

export type Fetcher = (url: string) => Promise<string>

/** Fetches every URL, at most `concurrency` at a time, and returns the page sizes in the same order as `urls`. */
export async function pageSizes(urls: readonly string[], fetchPage: Fetcher, concurrency = 4): Promise<number[]> {
  return mapLimit(urls, concurrency, async (url) => (await fetchPage(url)).length)
}
