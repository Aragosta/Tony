/** Rounds to `digits` decimals, half away from zero. For display values, not cents. */
export function roundTo(x: number, digits: number): number {
  const f = 10 ** digits
  return (Math.sign(x) * Math.round(Math.abs(x) * f + Number.EPSILON)) / f
}

/** Rounds to the nearest multiple of `step`. */
export function roundToStep(x: number, step: number): number {
  return Math.round(x / step) * step
}
