import { roundTo } from "./round.ts"

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  return roundTo(xs.reduce((a, b) => a + b, 0) / xs.length, 2)
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : roundTo((s[m - 1]! + s[m]!) / 2, 2)
}
