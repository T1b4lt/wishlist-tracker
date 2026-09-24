import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('api barrel', () => {
  it('re-exports the client and every resource module namespace', () => {
    expect(typeof api.request).toBe('function');
    expect(typeof api.ApiError).toBe('function');
    expect(typeof api.products.list).toBe('function');
    expect(typeof api.categories.list).toBe('function');
    expect(typeof api.config.get).toBe('function');
    expect(typeof api.telegram.getChatId).toBe('function');
  });
});
