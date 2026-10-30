export function sumCents(values: readonly number[]): number {
  let total = 0
  for (const v of values) {
    if (!Number.isInteger(v)) throw new TypeError(`not a whole number of cents: ${v}`)
    total += v
  }
  return total
}
