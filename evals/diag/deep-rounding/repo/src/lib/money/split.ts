/** Splits `cents` into `parts` integer shares that add up to `cents`; earlier shares get the extra cents. */
export function splitCents(cents: number, parts: number): number[] {
  const base = Math.trunc(cents / parts)
  const rest = cents - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < Math.abs(rest) ? Math.sign(rest) : 0))
}
