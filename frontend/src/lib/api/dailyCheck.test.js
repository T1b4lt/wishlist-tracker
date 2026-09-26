import { describe, expect, it, vi } from 'vitest';
import { request } from './client';
import * as dailyCheck from './dailyCheck';

vi.mock('./client', () => ({ request: vi.fn() }));

describe('dailyCheck api module', () => {
  it('get requests GET /daily-check/', () => {
    dailyCheck.get('sig');
    expect(request).toHaveBeenCalledWith('/daily-check/', { signal: 'sig' });
  });
});
