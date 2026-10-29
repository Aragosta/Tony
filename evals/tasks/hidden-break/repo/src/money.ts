/** Pads a digit string to two digits. */
export function pad2(digits: string): string {
  return digits.padStart(2, "0")
}

/** "12.34" -> 1234, "12" -> 1200, "0.5" -> 50 */
export function toCents(amount: string): number {
  const [whole, fraction = ""] = amount.split(".")
  return Number(whole) * 100 + Number(pad2(fraction))
}

/** 1234 -> "12.34", 5 -> "0.05" */
export function formatCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${pad2(String(cents % 100))}`
}
