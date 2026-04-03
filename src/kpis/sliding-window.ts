export interface TimestampedEntry<T> {
  data: T;
  timestamp: number;
}

const DURATION_RE = /^(\d+)(h|d)$/;

/** Parse a duration string like "1h", "6h", "24h", "7d" into milliseconds. */
export function parseDuration(window: string): number {
  const match = DURATION_RE.exec(window);
  if (!match) {
    throw new Error(`Invalid window duration: "${window}". Expected format: "1h", "6h", "24h", "7d".`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'h') return value * 60 * 60 * 1000;
  // unit === 'd'
  return value * 24 * 60 * 60 * 1000;
}

/**
 * Sliding window that stores timestamped entries and evicts those outside the window.
 * Uses a simple array — sufficient for the expected throughput (hundreds of events).
 */
export class SlidingWindow<T> {
  private buffer: TimestampedEntry<T>[] = [];
  private readonly windowMs: number;

  constructor(window: string) {
    this.windowMs = parseDuration(window);
  }

  /** Add an entry to the window. */
  push(data: T, timestamp: number): void {
    this.buffer.push({ data, timestamp });
  }

  /** Remove entries older than the window relative to `now`. */
  evict(now: number = Date.now()): void {
    const cutoff = now - this.windowMs;
    // Find the first entry that's within the window
    let firstValid = 0;
    while (firstValid < this.buffer.length && this.buffer[firstValid].timestamp < cutoff) {
      firstValid++;
    }
    if (firstValid > 0) {
      this.buffer = this.buffer.slice(firstValid);
    }
  }

  /** Return all valid entries (does NOT auto-evict; call evict() first). */
  entries(): TimestampedEntry<T>[] {
    return this.buffer;
  }

  /** Number of entries currently in the buffer. */
  get size(): number {
    return this.buffer.length;
  }

  /** Get the window duration in milliseconds. */
  get durationMs(): number {
    return this.windowMs;
  }

  /** Clear all entries. */
  clear(): void {
    this.buffer = [];
  }
}
