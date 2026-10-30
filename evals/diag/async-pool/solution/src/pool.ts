/** See README.md for the contract. */
export function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be an integer >= 1, got ${limit}`)
  return new Promise((resolve, reject) => {
    const results = new Array<R>(items.length)
    let next = 0
    let done = 0
    let failed = false
    if (items.length === 0) return resolve([])
    const start = () => {
      if (failed || next >= items.length) return
      const i = next++
      fn(items[i]!, i).then(
        (value) => {
          if (failed) return
          results[i] = value
          if (++done === items.length) resolve(results)
          else start()
        },
        (error) => {
          if (failed) return
          failed = true
          reject(error)
        },
      )
    }
    for (let k = 0; k < Math.min(limit, items.length); k++) start()
  })
}
