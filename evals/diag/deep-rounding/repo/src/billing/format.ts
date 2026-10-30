/** 1072 → "€10.72", -3 → "-€0.03". */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  return `${sign}€${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}
