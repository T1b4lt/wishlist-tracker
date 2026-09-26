import { describe, expect, it } from 'vitest';
import { STALE_AFTER_DAYS, daysSinceCheck, isStale } from './staleness';

const DAY = 86400;
const NOW = 1_800_000_000;

describe('daysSinceCheck', () => {
  it('returns null when the product was never checked', () => {
    expect(daysSinceCheck(null, NOW)).toBeNull();
    expect(daysSinceCheck(undefined, NOW)).toBeNull();
  });

  it('counts whole days elapsed since the last check', () => {
    expect(daysSinceCheck(NOW, NOW)).toBe(0);
    expect(daysSinceCheck(NOW - DAY + 1, NOW)).toBe(0);
    expect(daysSinceCheck(NOW - 4 * DAY - 10, NOW)).toBe(4);
  });

  it('never returns a negative count for a check in the future', () => {
    expect(daysSinceCheck(NOW + DAY, NOW)).toBe(0);
  });
});

describe('isStale', () => {
  it('uses a 3-day threshold', () => {
    expect(STALE_AFTER_DAYS).toBe(3);
  });

  it('is false for a product that was never checked', () => {
    expect(isStale({ last_checked_at: null }, NOW)).toBe(false);
  });

  it('is false while the last check is newer than the threshold', () => {
    expect(isStale({ last_checked_at: NOW - 3 * DAY + 1 }, NOW)).toBe(false);
  });

  it('is true once the last check is at least the threshold old', () => {
    expect(isStale({ last_checked_at: NOW - 3 * DAY }, NOW)).toBe(true);
    expect(isStale({ last_checked_at: NOW - 10 * DAY }, NOW)).toBe(true);
  });
});
