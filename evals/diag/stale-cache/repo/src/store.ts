import { normalizeSku } from "./keys.ts"

/** The price database. Slow in production; counts reads so tests can see when the cache is bypassed. */
export class PriceStore {
  private prices = new Map<string, number>()
  reads = 0

  async read(sku: string): Promise<number | undefined> {
    this.reads++
    return this.prices.get(normalizeSku(sku))
  }

  async write(sku: string, cents: number): Promise<void> {
    this.prices.set(normalizeSku(sku), cents)
  }
}
