/**
 * In-memory sliding-window counters (one server process, so no Redis — PLAN.md §1).
 * `hit(key)` records an event; `blocked(key)` is true once `limit` events happened in `windowMs`.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  blocked(key: string): boolean {
    return this.recent(key).length >= this.limit;
  }

  hit(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
    // Keep the map small: drop every expired key from time to time.
    if (this.hits.size > 1000) for (const k of [...this.hits.keys()]) this.recent(k);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  clear(): void {
    this.hits.clear();
  }
}

/** Limits of the auth routes (TASKS.md T24). */
export function createAuthRateLimits(now?: () => number) {
  return {
    /** Failed logins per IP + e-mail: 10 / 15 min, then 429 `TOO_MANY_ATTEMPTS`. */
    login: new RateLimiter(10, 15 * 60_000, now),
    /** Reset requests per e-mail: 3 / hour (beyond: neutral answer, nothing sent). */
    resetByEmail: new RateLimiter(3, 3600_000, now),
    /** Reset requests per IP: 10 / hour. */
    resetByIp: new RateLimiter(10, 3600_000, now),
    clear() {
      this.login.clear();
      this.resetByEmail.clear();
      this.resetByIp.clear();
    },
  };
}
export type AuthRateLimits = ReturnType<typeof createAuthRateLimits>;
