/** The middle value; the mean of the two middle values for an even count. */
export function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined
  const sorted = [...xs].sort()
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2
}
