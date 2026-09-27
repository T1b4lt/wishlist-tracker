import { describe, expect, it, vi } from 'vitest';
import { request } from './client';
import * as offers from './offers';

vi.mock('./client', () => ({ request: vi.fn() }));

describe('offers api module', () => {
  it('add posts to /products/:id/offers', () => {
    const data = { url: 'https://a.es/x', currency: 'EUR' };
    offers.add(1, data, 'sig');
    expect(request).toHaveBeenCalledWith('/products/1/offers', {
      method: 'POST',
      body: data,
      signal: 'sig'
    });
  });

  it('update patches /offers/:id', () => {
    offers.update(5, { url: 'https://b.es/x' }, 'sig');
    expect(request).toHaveBeenCalledWith('/offers/5', {
      method: 'PATCH',
      body: { url: 'https://b.es/x' },
      signal: 'sig'
    });
  });

  it('unlink posts to /offers/:id/unlink', () => {
    offers.unlink(5, 'sig');
    expect(request).toHaveBeenCalledWith('/offers/5/unlink', {
      method: 'POST',
      signal: 'sig'
    });
  });

  it('remove deletes /offers/:id', () => {
    offers.remove(5, 'sig');
    expect(request).toHaveBeenCalledWith('/offers/5', {
      method: 'DELETE',
      signal: 'sig'
    });
  });
});
