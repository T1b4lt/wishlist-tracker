import { describe, expect, it, vi } from 'vitest';
import { request } from './client';
import * as categories from './categories';

vi.mock('./client', () => ({ request: vi.fn() }));

describe('categories api module', () => {
  it('list requests GET /categories/', () => {
    categories.list('sig');
    expect(request).toHaveBeenCalledWith('/categories/', { signal: 'sig' });
  });

  it('create posts to /categories/', () => {
    const data = { name: 'Electronics', color: '#000000' };
    categories.create(data, 'sig');
    expect(request).toHaveBeenCalledWith('/categories/', {
      method: 'POST',
      body: data,
      signal: 'sig'
    });
  });

  it('update patches /categories/:id', () => {
    const data = { name: 'Renamed' };
    categories.update(3, data, 'sig');
    expect(request).toHaveBeenCalledWith('/categories/3', {
      method: 'PATCH',
      body: data,
      signal: 'sig'
    });
  });

  it('remove deletes /categories/:id', () => {
    categories.remove(3, 'sig');
    expect(request).toHaveBeenCalledWith('/categories/3', {
      method: 'DELETE',
      signal: 'sig'
    });
  });
});
