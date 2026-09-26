import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import { DEFAULT_HIST_WINDOW, HIST_WINDOW_OPTIONS } from './histWindow';
import { RANGE_OPTIONS } from './productHistory';

// Frontend side of the shared contracts (see `contracts/README.md`); the
// backend side lives in `backend/tests/test_contracts.py`.

const HIST_WINDOW = readContract('hist-window.json');

describe('hist-window contract', () => {
  it('pins the window options', () => {
    expect(HIST_WINDOW_OPTIONS).toEqual(HIST_WINDOW.options);
  });

  it('pins the default window', () => {
    expect(DEFAULT_HIST_WINDOW).toBe(HIST_WINDOW.default);
  });

  it('offers exactly the window options as chart ranges', () => {
    expect(RANGE_OPTIONS.map(Number)).toEqual(HIST_WINDOW.options);
  });
});
