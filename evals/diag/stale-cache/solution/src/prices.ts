import { TtlCache } from "./cache.ts"
import { priceKey } from "./keys.ts"
import type { PriceStore } from "./store.ts"

const FIVE_MINUTES = 5 * 60 * 1000

export class PriceService {
  private cache: TtlCache<number>

  constructor(
    private store: PriceStore,
    now: () => number = Date.now,
  ) {
    this.cache = new TtlCache<number>(FIVE_MINUTES, now)
  }

  /** The current price in cents, from the cache when possible. */
  async getPrice(sku: string): Promise<number | undefined> {
    const key = priceKey(sku)
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    const cents = await this.store.read(sku)
    if (cents !== undefined) this.cache.set(key, cents)
    return cents
  }

  /** Admin: change one price. Shoppers must see the new price right away. */
  async updatePrice(sku: string, cents: number): Promise<void> {
    if (!Number.isInteger(cents) || cents < 0) throw new RangeError(`invalid price: ${cents}`)
    await this.store.write(sku, cents)
    this.cache.delete(priceKey(sku))
  }

  /** Admin: import a price list (CSV upload). */
  async updatePrices(rows: { sku: string; cents: number }[]): Promise<void> {
    for (const row of rows) {
      if (!Number.isInteger(row.cents) || row.cents < 0) throw new RangeError(`invalid price for ${row.sku}: ${row.cents}`)
    }
    for (const row of rows) {
      await this.store.write(row.sku, row.cents)
      this.cache.delete(priceKey(row.sku))
    }
  }
}
