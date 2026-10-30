/** Rounds an amount in fractional cents to whole cents (README, money rule 3). */
export function roundCents(x: number): number {
  return Math.floor(x + 0.5)
}
