export interface Line {
  sku: string
  /** Unit price in cents; negative for a discount. */
  cents: number
  qty: number
}
