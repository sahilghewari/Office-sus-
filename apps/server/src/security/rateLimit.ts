/** Token bucket. `capacity` burst, refilled at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private perSecond: number,
    private now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }
  take(n = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Keyed limiter for things like join attempts per IP. */
export class KeyedLimiter {
  private buckets = new Map<string, { b: TokenBucket; seen: number }>();
  constructor(
    private capacity: number,
    private perSecond: number,
    private now: () => number = Date.now,
  ) {}
  take(key: string): boolean {
    let e = this.buckets.get(key);
    if (!e) {
      e = { b: new TokenBucket(this.capacity, this.perSecond, this.now), seen: this.now() };
      this.buckets.set(key, e);
    }
    e.seen = this.now();
    if (this.buckets.size > 10000) this.gc();
    return e.b.take();
  }
  private gc() {
    const cutoff = this.now() - 10 * 60_000;
    for (const [k, v] of this.buckets) if (v.seen < cutoff) this.buckets.delete(k);
  }
}
