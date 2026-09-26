import { describe, expect, it } from 'vitest';
import { API_URL } from './client';
import { faviconUrl } from './stores';

describe('stores api module', () => {
  it('faviconUrl points to /stores/:id/favicon on the API origin', () => {
    expect(faviconUrl(7)).toBe(`${API_URL}/stores/7/favicon`);
  });
});
