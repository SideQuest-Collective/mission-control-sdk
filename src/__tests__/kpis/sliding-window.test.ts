import { describe, it, expect } from 'vitest';
import { SlidingWindow, parseDuration } from '../../kpis/sliding-window.js';

describe('parseDuration', () => {
  it('parses hours', () => {
    expect(parseDuration('1h')).toBe(3_600_000);
    expect(parseDuration('6h')).toBe(21_600_000);
    expect(parseDuration('24h')).toBe(86_400_000);
  });

  it('parses days', () => {
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('1d')).toBe(86_400_000);
  });

  it('throws on invalid format', () => {
    expect(() => parseDuration('10m')).toThrow('Invalid window duration');
    expect(() => parseDuration('abc')).toThrow('Invalid window duration');
    expect(() => parseDuration('')).toThrow('Invalid window duration');
  });
});

describe('SlidingWindow', () => {
  it('stores and retrieves entries', () => {
    const w = new SlidingWindow<string>('1h');
    w.push('a', 1000);
    w.push('b', 2000);

    expect(w.size).toBe(2);
    expect(w.entries().map((e) => e.data)).toEqual(['a', 'b']);
  });

  it('evicts entries older than the window', () => {
    const w = new SlidingWindow<string>('1h');
    const base = 1_000_000;
    w.push('old', base);
    w.push('recent', base + 3_500_000); // 3500s later

    // Evict at base + 1h + 1ms — 'old' is outside, 'recent' is inside
    w.evict(base + 3_600_001);

    expect(w.size).toBe(1);
    expect(w.entries()[0].data).toBe('recent');
  });

  it('evicts all entries when all are outside the window', () => {
    const w = new SlidingWindow<string>('1h');
    w.push('a', 1000);
    w.push('b', 2000);

    w.evict(1000 + 3_600_001 + 1000);
    expect(w.size).toBe(0);
  });

  it('keeps all entries when all are within the window', () => {
    const w = new SlidingWindow<string>('1h');
    const now = 5_000_000;
    w.push('a', now - 1000);
    w.push('b', now - 500);
    w.push('c', now);

    w.evict(now);
    expect(w.size).toBe(3);
  });

  it('clears all entries', () => {
    const w = new SlidingWindow<string>('1h');
    w.push('a', 1000);
    w.push('b', 2000);
    w.clear();

    expect(w.size).toBe(0);
    expect(w.entries()).toEqual([]);
  });

  it('reports durationMs', () => {
    const w = new SlidingWindow<string>('7d');
    expect(w.durationMs).toBe(604_800_000);
  });

  it('handles empty window correctly', () => {
    const w = new SlidingWindow<string>('1h');
    w.evict(Date.now());
    expect(w.size).toBe(0);
    expect(w.entries()).toEqual([]);
  });

  it('preserves insertion order after partial eviction', () => {
    const w = new SlidingWindow<number>('1h');
    const base = 1_000_000;
    w.push(1, base);                  // 0 min
    w.push(2, base + 1_800_000);      // 30 min
    w.push(3, base + 3_500_000);      // ~58 min
    w.push(4, base + 3_600_000);      // 60 min

    // Evict at base + 7_099_999: cutoff = base + 3_499_999
    // Entry 1 (base) and 2 (base + 1.8M) are out; 3 (base + 3.5M) and 4 are in
    w.evict(base + 7_099_999);

    const remaining = w.entries().map((e) => e.data);
    expect(remaining).toEqual([3, 4]);
  });
});
