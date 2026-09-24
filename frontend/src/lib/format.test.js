import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatPercent,
  formatPrice,
  formatRelative,
  getLocale,
  getTrend
} from './format';

describe('getLocale', () => {
  it('maps "spanish" to "es-ES"', () => {
    expect(getLocale('spanish')).toBe('es-ES');
  });

  it('maps anything else to "en-US"', () => {
    expect(getLocale('english')).toBe('en-US');
    expect(getLocale(undefined)).toBe('en-US');
  });
});

describe('formatPrice', () => {
  it('formats a value as a localized currency string', () => {
    expect(formatPrice(19.9, 'EUR', 'en-US')).toBe('€19.90');
    expect(formatPrice(19.9, 'EUR', 'es-ES')).toBe('19,90 €');
  });

  it('returns "-" when the value is null, undefined or NaN', () => {
    expect(formatPrice(null, 'EUR', 'en-US')).toBe('-');
    expect(formatPrice(undefined, 'EUR', 'en-US')).toBe('-');
    expect(formatPrice(NaN, 'EUR', 'en-US')).toBe('-');
  });
});

describe('formatPercent', () => {
  it('formats a percentage number (e.g. -3.2 for -3.2%)', () => {
    expect(formatPercent(-3.2, 'en-US')).toBe('-3.2%');
    expect(formatPercent(12, 'en-US')).toBe('12.0%');
  });

  it('supports signDisplay', () => {
    expect(formatPercent(12, 'en-US', { signDisplay: 'always' })).toBe(
      '+12.0%'
    );
    expect(formatPercent(0, 'en-US', { signDisplay: 'always' })).toBe('+0.0%');
    expect(formatPercent(0, 'en-US', { signDisplay: 'exceptZero' })).toBe(
      '0.0%'
    );
  });

  it('returns "-" when the value is null, undefined or NaN', () => {
    expect(formatPercent(null, 'en-US')).toBe('-');
    expect(formatPercent(undefined, 'en-US')).toBe('-');
    expect(formatPercent(NaN, 'en-US')).toBe('-');
  });
});

describe('formatDate', () => {
  const ts = Date.UTC(2024, 2, 5) / 1000; // 2024-03-05T00:00:00Z

  it('formats a "short" date (the default) with month, day and year', () => {
    expect(formatDate(ts, 'en-US')).toMatch(/Mar 5, 2024/);
  });

  it('formats a "long" date with the full month name', () => {
    expect(formatDate(ts, 'en-US', 'long')).toMatch(/March 5, 2024/);
  });

  it('accepts explicit Intl.DateTimeFormatOptions', () => {
    expect(formatDate(ts, 'en-US', { year: 'numeric' })).toBe('2024');
  });

  it('returns "-" when given no timestamp', () => {
    expect(formatDate(null, 'en-US')).toBe('-');
    expect(formatDate(undefined, 'en-US')).toBe('-');
  });
});

describe('formatRelative', () => {
  const now = Date.UTC(2024, 2, 5, 12, 0, 0) / 1000;

  it('formats a past timestamp in days', () => {
    const twoDaysAgo = now - 2 * 24 * 60 * 60;
    expect(formatRelative(twoDaysAgo, 'en-US', now)).toBe('2 days ago');
  });

  it('formats a future timestamp', () => {
    const inThreeHours = now + 3 * 60 * 60;
    expect(formatRelative(inThreeHours, 'en-US', now)).toBe('in 3 hours');
  });

  it('formats a timestamp seconds in the past as "now" wording', () => {
    const fewSecondsAgo = now - 5;
    expect(formatRelative(fewSecondsAgo, 'en-US', now)).toBe('5 seconds ago');
  });

  it('returns "-" when given no timestamp', () => {
    expect(formatRelative(null, 'en-US', now)).toBe('-');
  });
});

describe('getTrend', () => {
  it('returns "up" for a positive value', () => {
    expect(getTrend(12.5)).toBe('up');
  });

  it('returns "down" for a negative value', () => {
    expect(getTrend(-3.4)).toBe('down');
  });

  it('returns "flat" for exactly 0', () => {
    expect(getTrend(0)).toBe('flat');
  });

  it('returns null when there is no value', () => {
    expect(getTrend(null)).toBeNull();
    expect(getTrend(undefined)).toBeNull();
    expect(getTrend(NaN)).toBeNull();
  });
});
