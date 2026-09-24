import { describe, expect, it, vi } from 'vitest';
import { request } from './client';
import * as config from './config';

vi.mock('./client', () => ({ request: vi.fn() }));

describe('config api module', () => {
  it('get requests GET /config/', () => {
    config.get('sig');
    expect(request).toHaveBeenCalledWith('/config/', { signal: 'sig' });
  });

  it('update patches /config/', () => {
    const data = { hist_window_size: 30 };
    config.update(data, 'sig');
    expect(request).toHaveBeenCalledWith('/config/', {
      method: 'PATCH',
      body: data,
      signal: 'sig'
    });
  });
});
