import { describe, expect, it, vi } from 'vitest';
import { getCurrencySymbol, getPriorityLabel } from './web_utils';

describe('getCurrencySymbol', () => {
  it('returns the symbol for a known currency code', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('is case-insensitive', () => {
    expect(getCurrencySymbol('eur')).toBe('€');
  });

  it('falls back to the original value for an unknown currency code', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
  });

  it('falls back to "$" when given no currency', () => {
    expect(getCurrencySymbol(undefined)).toBe('$');
  });
});

describe('getPriorityLabel', () => {
  it('translates a known priority using the provided translate function', () => {
    const translate = vi.fn((key) => `translated:${key}`);

    expect(getPriorityLabel('high', translate)).toBe(
      'translated:common.priority.high'
    );
    expect(translate).toHaveBeenCalledWith('common.priority.high');
  });

  it('is case-insensitive', () => {
    const translate = vi.fn((key) => `translated:${key}`);

    expect(getPriorityLabel('HIGH', translate)).toBe(
      'translated:common.priority.high'
    );
  });

  it('capitalizes a known priority when no translate function is given', () => {
    expect(getPriorityLabel('medium')).toBe('Medium');
  });

  it('returns the original value for an unknown priority', () => {
    expect(getPriorityLabel('urgent', vi.fn())).toBe('urgent');
  });

  it('returns an empty string when given no priority', () => {
    expect(getPriorityLabel('')).toBe('');
    expect(getPriorityLabel(undefined)).toBe('');
  });
});
