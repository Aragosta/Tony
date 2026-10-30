/** SKUs are case-insensitive and may carry stray whitespace from the admin form: "abc-1 " and "ABC-1" are one product. */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase()
}

export function priceKey(sku: string): string {
  return `price:${normalizeSku(sku)}`
}
