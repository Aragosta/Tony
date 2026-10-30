/** Rounds an amount in fractional cents to whole cents, half away from zero (README, money rule 3). */
export function roundCents(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5) || 0
}
