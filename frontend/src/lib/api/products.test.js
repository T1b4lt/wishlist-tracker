import { describe, expect, it, vi } from 'vitest';
import { request } from './client';
import * as products from './products';

vi.mock('./client', () => ({ request: vi.fn() }));

describe('products api module', () => {
  it('list requests GET /products/', () => {
    products.list('sig');
    expect(request).toHaveBeenCalledWith('/products/', { signal: 'sig' });
  });

  it('dashboardSummary requests GET /products/dashboard-summary', () => {
    products.dashboardSummary();
    expect(request).toHaveBeenCalledWith('/products/dashboard-summary', {
      signal: undefined
    });
  });

  it('get requests GET /products/:id', () => {
    products.get(42, 'sig');
    expect(request).toHaveBeenCalledWith('/products/42', { signal: 'sig' });
  });

  it('create posts to /products/', () => {
    const data = { name: 'Item' };
    products.create(data, 'sig');
    expect(request).toHaveBeenCalledWith('/products/', {
      method: 'POST',
      body: data,
      signal: 'sig'
    });
  });

  it('update patches /products/:id', () => {
    const data = { name: 'Renamed' };
    products.update(7, data, 'sig');
    expect(request).toHaveBeenCalledWith('/products/7', {
      method: 'PATCH',
      body: data,
      signal: 'sig'
    });
  });

  it('remove deletes /products/:id', () => {
    products.remove(7, 'sig');
    expect(request).toHaveBeenCalledWith('/products/7', {
      method: 'DELETE',
      signal: 'sig'
    });
  });

  it('extractInfo posts the url to /extract-product-info/', () => {
    products.extractInfo('https://example.com/item', 'sig');
    expect(request).toHaveBeenCalledWith('/extract-product-info/', {
      method: 'POST',
      body: { url: 'https://example.com/item' },
      signal: 'sig'
    });
  });
});
