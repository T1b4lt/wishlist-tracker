import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './client';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with the API_URL prefix and returns the parsed JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await request('/products/');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/products/',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ id: 1 });
  });

  it('defaults to a GET request when no method is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await request('/products/');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('serializes the body as JSON and sets the Content-Type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    await request('/products/', {
      method: 'POST',
      body: { name: 'Item' }
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Item' }));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('forwards an AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await request('/products/', { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('returns null when the response has no body (e.g. a 204 delete)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await request('/products/1', { method: 'DELETE' });

    expect(result).toBeNull();
  });

  it('throws an ApiError with status, detail and message read from the JSON body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { detail: 'Category is in use' },
          { status: 400, statusText: 'Bad Request' }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const error = await request('/categories/1', { method: 'DELETE' }).catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.detail).toBe('Category is in use');
    expect(error.message).toBe('Category is in use');
  });

  it('falls back to a generic message when the error body has no detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', {
        status: 500,
        statusText: 'Internal Server Error'
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await request('/products/').catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.detail).toBeUndefined();
    expect(error.message).toMatch(/500/);
  });
});
