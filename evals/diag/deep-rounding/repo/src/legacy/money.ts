/**
 * @deprecated Since 2024 billing uses src/lib/money. Kept for old import scripts; not imported anywhere.
 */
export function roundCents(x: number): number {
  return Math.floor(x + 0.5)
}

/** @deprecated */
export function toCents(euros: number): number {
  return roundCents(euros * 100)
}

/** @deprecated */
export function fromCents(cents: number): number {
  return cents / 100
}
