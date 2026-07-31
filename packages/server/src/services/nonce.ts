/**
 * nonce.ts — replay protection for write requests.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Edge reaches the server over Bluetooth LE via the phone, a link with
 * multi-second latency that drops routinely mid-ride. A device app that does
 * not retry is unusable; a device app that does retry can deliver the same
 * approval twice.
 *
 * Delivering an approval twice is not a cosmetic bug. The first Enter answers
 * the permission prompt; the second lands in whatever Claude Code shows next —
 * possibly a different prompt, possibly the input box. So every write carries a
 * client-generated nonce, and a nonce that has been seen before returns the
 * original outcome instead of acting again.
 *
 * This is an in-memory store with a bounded size and a TTL. It is deliberately
 * not backed by Redis or a database: the bridge serves one developer's tmux
 * session from a single process, and a restart losing nonce history is
 * acceptable (worst case, one retry after a restart re-executes). Introducing a
 * datastore here would add an operational dependency to a tool whose entire
 * appeal is that it is a single process next to tmux.
 */

/** How long a nonce is remembered. Comfortably longer than any BLE retry. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Hard cap on retained nonces. Bounds memory against a client that generates a
 * fresh nonce per request forever.
 */
const DEFAULT_MAX_ENTRIES = 10_000;

export interface NonceRecord<T> {
  /** Result of the original execution, replayed on a duplicate. */
  result: T;
  /** When this entry expires (epoch ms). */
  expiresAt: number;
}

export class NonceStore<T> {
  readonly #entries = new Map<string, NonceRecord<T>>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  /**
   * @param ttlMs      Retention window.
   * @param maxEntries Upper bound on retained nonces.
   * @param now        Clock, injectable so tests need not sleep.
   */
  constructor({
    ttlMs = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = Date.now,
  }: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
    this.#now = now;
  }

  /**
   * Look up a nonce.
   * @returns The stored result, or undefined if unseen or expired.
   */
  get(nonce: string): T | undefined {
    const record = this.#entries.get(nonce);
    if (!record) return undefined;

    if (record.expiresAt <= this.#now()) {
      this.#entries.delete(nonce);
      return undefined;
    }
    return record.result;
  }

  /** Record the outcome of executing `nonce`. */
  set(nonce: string, result: T): void {
    this.#evictIfNeeded();
    this.#entries.set(nonce, {
      result,
      expiresAt: this.#now() + this.#ttlMs,
    });
  }

  /**
   * Reserve a nonce before executing, so two concurrent requests carrying the
   * same nonce cannot both proceed.
   *
   * Node runs this synchronously between awaits, so the check and the insert
   * cannot interleave — a second request with the same nonce sees the
   * placeholder and is rejected as in-flight rather than executing in parallel.
   *
   * @returns true when the caller owns the nonce and should proceed.
   */
  reserve(nonce: string, placeholder: T): boolean {
    if (this.get(nonce) !== undefined) return false;
    this.set(nonce, placeholder);
    return true;
  }

  /** Drop a reservation, so a failed attempt can be retried with the same nonce. */
  release(nonce: string): void {
    this.#entries.delete(nonce);
  }

  /** Current entry count, after pruning expired records. */
  get size(): number {
    this.#prune();
    return this.#entries.size;
  }

  #prune(): void {
    const now = this.#now();
    for (const [key, record] of this.#entries) {
      if (record.expiresAt <= now) this.#entries.delete(key);
    }
  }

  /**
   * Keep the store bounded. Prunes expired entries first; if that is not
   * enough, drops the oldest insertions, which Map iterates in insertion order.
   */
  #evictIfNeeded(): void {
    if (this.#entries.size < this.#maxEntries) return;

    this.#prune();
    if (this.#entries.size < this.#maxEntries) return;

    const excess = this.#entries.size - this.#maxEntries + 1;
    let dropped = 0;
    for (const key of this.#entries.keys()) {
      this.#entries.delete(key);
      if (++dropped >= excess) break;
    }
  }
}
