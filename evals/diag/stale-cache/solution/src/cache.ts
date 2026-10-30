/** A small in-memory cache. An entry expires `ttlMs` after it was set: from that moment on, `get` returns undefined. */
export class TtlCache<V> {
  private entries = new Map<string, { value: V; expiresAt: number }>()

  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  get size(): number {
    return this.entries.size
  }
}
