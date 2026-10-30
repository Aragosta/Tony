/** See README.md for the contract. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit)
    await Promise.all(
      batch.map(async (item, i) => {
        try {
          results.push(await fn(item, start + i))
        } catch {
          // a failed page is skipped
        }
      }),
    )
  }
  return results
}
