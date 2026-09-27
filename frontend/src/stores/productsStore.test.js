import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offers as offersApi, products as productsApi } from '@/lib/api';
import {
  useProductsStore,
  initialProductsState,
  cancelPriceChecks,
  PRICE_CHECK_POLL_MS,
  PRICE_CHECK_MAX_POLLS
} from './productsStore';

vi.mock('@/lib/api', () => ({
  products: {
    dashboardSummary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    merge: vi.fn()
  },
  offers: {
    add: vi.fn(),
    update: vi.fn(),
    unlink: vi.fn(),
    remove: vi.fn()
  }
}));

class ApiErrorLike extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let consoleErrorSpy;

beforeEach(() => {
  useProductsStore.setState(initialProductsState);
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cancelPriceChecks();
  vi.useRealTimers();
  consoleErrorSpy.mockRestore();
});

describe('useProductsStore', () => {
  it('starts idle with an empty items list', () => {
    const state = useProductsStore.getState();
    expect(state.status).toBe('idle');
    expect(state.items).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.details).toEqual({});
  });

  describe('fetchSummary', () => {
    it('transitions idle -> loading -> success and stores items', async () => {
      let resolveRequest;
      productsApi.dashboardSummary.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );

      const promise = useProductsStore.getState().fetchSummary();
      expect(useProductsStore.getState().status).toBe('loading');

      resolveRequest([{ id: 1, name: 'Widget' }]);
      await promise;

      const state = useProductsStore.getState();
      expect(state.status).toBe('success');
      expect(state.items).toEqual([{ id: 1, name: 'Widget' }]);
      expect(state.error).toBeNull();
    });

    it('transitions to error, normalizes the error and logs it', async () => {
      const err = new ApiErrorLike('boom', 500);
      productsApi.dashboardSummary.mockRejectedValue(err);

      await useProductsStore.getState().fetchSummary();

      const state = useProductsStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toEqual({ status: 500, message: 'boom' });
      expect(state.items).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), err);
    });

    it('normalizes a non-ApiError failure with a null status', async () => {
      productsApi.dashboardSummary.mockRejectedValue(new Error('network down'));

      await useProductsStore.getState().fetchSummary();

      expect(useProductsStore.getState().error).toEqual({
        status: null,
        message: 'network down'
      });
    });
  });

  describe('create', () => {
    it('creates the product and refetches the summary', async () => {
      productsApi.create.mockResolvedValue({ id: 5, name: 'New' });
      productsApi.dashboardSummary.mockResolvedValue([{ id: 5, name: 'New' }]);

      const created = await useProductsStore.getState().create({ name: 'New' });

      expect(productsApi.create).toHaveBeenCalledWith({ name: 'New' });
      expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);
      expect(created).toEqual({ id: 5, name: 'New' });
      expect(useProductsStore.getState().items).toEqual([
        { id: 5, name: 'New' }
      ]);
      expect(useProductsStore.getState().status).toBe('success');
    });

    it('propagates the error and does not refetch when creation fails', async () => {
      productsApi.create.mockRejectedValue(new Error('invalid'));

      await expect(
        useProductsStore.getState().create({ name: 'Bad' })
      ).rejects.toThrow('invalid');
      expect(productsApi.dashboardSummary).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates the product, refetches the summary, and refreshes its cached detail', async () => {
      productsApi.update.mockResolvedValue({ id: 5, name: 'Renamed' });
      productsApi.dashboardSummary.mockResolvedValue([
        { id: 5, name: 'Renamed' }
      ]);
      productsApi.get.mockResolvedValue({ id: 5, name: 'Renamed (full)' });

      const updated = await useProductsStore
        .getState()
        .update(5, { name: 'Renamed' });

      expect(productsApi.update).toHaveBeenCalledWith(5, { name: 'Renamed' });
      expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);
      expect(updated).toEqual({ id: 5, name: 'Renamed' });
      // The detail cache is refreshed too (even though nothing had it
      // cached before this update), so a product page that opens right
      // after already has fresh data instead of needing its own fetch.
      expect(productsApi.get).toHaveBeenCalledWith(5);
      expect(useProductsStore.getState().details[5]).toEqual({
        status: 'success',
        error: null,
        data: { id: 5, name: 'Renamed (full)' }
      });
    });

    it('keeps the previous detail entry visible while silently refreshing it, never flipping it to loading', async () => {
      useProductsStore.setState({
        details: {
          5: { status: 'success', error: null, data: { id: 5, name: 'Old' } }
        }
      });
      productsApi.update.mockResolvedValue({ id: 5, name: 'New' });
      productsApi.dashboardSummary.mockResolvedValue([]);
      let resolveGet;
      productsApi.get.mockReturnValue(
        new Promise((resolve) => {
          resolveGet = resolve;
        })
      );

      const updatePromise = useProductsStore
        .getState()
        .update(5, { name: 'New' });

      // Flush every pending microtask (the `update`/`dashboardSummary`
      // resolutions leading up to the `get(5)` call), without depending on
      // exactly how many `await`s sit in between.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(productsApi.get).toHaveBeenCalledWith(5);
      expect(useProductsStore.getState().details[5]).toEqual({
        status: 'success',
        error: null,
        data: { id: 5, name: 'Old' }
      });

      resolveGet({ id: 5, name: 'New', description: 'fresh' });
      await updatePromise;

      expect(useProductsStore.getState().details[5]).toEqual({
        status: 'success',
        error: null,
        data: { id: 5, name: 'New', description: 'fresh' }
      });
    });

    it('leaves a cached detail entry untouched (not error) when the silent refresh fails', async () => {
      useProductsStore.setState({
        details: {
          5: { status: 'success', error: null, data: { id: 5, name: 'Old' } }
        }
      });
      productsApi.update.mockResolvedValue({ id: 5, name: 'New' });
      productsApi.dashboardSummary.mockResolvedValue([]);
      productsApi.get.mockRejectedValue(new Error('network down'));

      const updated = await useProductsStore
        .getState()
        .update(5, { name: 'New' });

      expect(updated).toEqual({ id: 5, name: 'New' });
      expect(useProductsStore.getState().details[5]).toEqual({
        status: 'success',
        error: null,
        data: { id: 5, name: 'Old' }
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the product and refetches the summary', async () => {
      productsApi.remove.mockResolvedValue(null);
      productsApi.dashboardSummary.mockResolvedValue([]);

      await useProductsStore.getState().remove(5);

      expect(productsApi.remove).toHaveBeenCalledWith(5);
      expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);
      expect(useProductsStore.getState().items).toEqual([]);
    });

    it('propagates the error and does not refetch when deletion fails', async () => {
      productsApi.remove.mockRejectedValue(new Error('cannot delete'));

      await expect(useProductsStore.getState().remove(5)).rejects.toThrow(
        'cannot delete'
      );
      expect(productsApi.dashboardSummary).not.toHaveBeenCalled();
    });
  });

  describe('fetchDetail', () => {
    it('transitions idle -> loading -> success for that id only', async () => {
      let resolveRequest;
      productsApi.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );

      const promise = useProductsStore.getState().fetchDetail(9);
      expect(useProductsStore.getState().details[9].status).toBe('loading');

      resolveRequest({ id: 9, name: 'Detail' });
      await promise;

      const state = useProductsStore.getState();
      expect(state.details[9]).toEqual({
        status: 'success',
        error: null,
        data: { id: 9, name: 'Detail' }
      });
      expect(state.details[7]).toBeUndefined();
    });

    it('keeps the previous data while re-fetching an already-cached id, only clearing it on success', async () => {
      useProductsStore.setState({
        details: {
          9: { status: 'success', error: null, data: { id: 9, name: 'Old' } }
        }
      });
      let resolveRequest;
      productsApi.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );

      const promise = useProductsStore.getState().fetchDetail(9);

      expect(useProductsStore.getState().details[9]).toEqual({
        status: 'loading',
        error: null,
        data: { id: 9, name: 'Old' }
      });

      resolveRequest({ id: 9, name: 'Fresh' });
      await promise;

      expect(useProductsStore.getState().details[9]).toEqual({
        status: 'success',
        error: null,
        data: { id: 9, name: 'Fresh' }
      });
    });

    it('stores the normalized error for that id on failure', async () => {
      productsApi.get.mockRejectedValue(new ApiErrorLike('not found', 404));

      await useProductsStore.getState().fetchDetail(9);

      const state = useProductsStore.getState();
      expect(state.details[9]).toEqual({
        status: 'error',
        error: { status: 404, message: 'not found' },
        data: null
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('keeps separate detail records for different ids', async () => {
      productsApi.get.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({
        id: 2
      });

      await useProductsStore.getState().fetchDetail(1);
      await useProductsStore.getState().fetchDetail(2);

      const state = useProductsStore.getState();
      expect(state.details[1].data).toEqual({ id: 1 });
      expect(state.details[2].data).toEqual({ id: 2 });
    });
  });
});

describe('offer actions', () => {
  it('addOffer refreshes the summary and the product detail', async () => {
    offersApi.add.mockResolvedValue({ id: 9 });
    productsApi.dashboardSummary.mockResolvedValue([]);
    productsApi.get.mockResolvedValue({ id: 1, offers: [] });

    const offer = await useProductsStore
      .getState()
      .addOffer(1, { url: 'https://a.es/x', currency: 'EUR' });

    expect(offer).toEqual({ id: 9 });
    expect(offersApi.add).toHaveBeenCalledWith(1, {
      url: 'https://a.es/x',
      currency: 'EUR'
    });
    expect(productsApi.dashboardSummary).toHaveBeenCalled();
    expect(useProductsStore.getState().details[1].data).toEqual({
      id: 1,
      offers: []
    });
  });

  it('updateOffer and removeOffer refresh the product detail', async () => {
    offersApi.update.mockResolvedValue({ id: 3 });
    offersApi.remove.mockResolvedValue({ ok: true });
    productsApi.dashboardSummary.mockResolvedValue([]);
    productsApi.get.mockResolvedValue({ id: 1, offers: [] });

    await useProductsStore
      .getState()
      .updateOffer(1, 3, { url: 'https://b.es/x' });
    await useProductsStore.getState().removeOffer(1, 3);

    expect(offersApi.update).toHaveBeenCalledWith(3, { url: 'https://b.es/x' });
    expect(offersApi.remove).toHaveBeenCalledWith(3);
    expect(productsApi.get).toHaveBeenCalledTimes(2);
  });

  it('merge drops the source detail from the cache', async () => {
    useProductsStore.setState({
      details: { 2: { status: 'success', error: null, data: { id: 2 } } }
    });
    productsApi.merge.mockResolvedValue({ id: 1, offers: [] });
    productsApi.dashboardSummary.mockResolvedValue([]);

    await useProductsStore
      .getState()
      .merge(1, { source_product_id: 2, keep: 'target' });

    const { details } = useProductsStore.getState();
    expect(details[2]).toBeUndefined();
    expect(details[1].data).toEqual({ id: 1, offers: [] });
  });

  it('unlinkOffer returns the new product', async () => {
    offersApi.unlink.mockResolvedValue({ id: 7 });
    productsApi.dashboardSummary.mockResolvedValue([]);
    productsApi.get.mockResolvedValue({ id: 1, offers: [] });

    await expect(
      useProductsStore.getState().unlinkOffer(1, 3)
    ).resolves.toEqual({ id: 7 });
  });
});

describe('price check after adding a store', () => {
  const detailWith = (lastCheckedAt) => ({
    id: 1,
    offers: [{ id: 9, last_checked_at: lastCheckedAt }]
  });

  beforeEach(() => {
    vi.useFakeTimers();
    productsApi.dashboardSummary.mockResolvedValue([]);
  });

  it('refetches the product until the new store has a price', async () => {
    offersApi.add.mockResolvedValue({ id: 9 });
    productsApi.get
      .mockResolvedValueOnce(detailWith(null)) // Refresh right after adding.
      .mockResolvedValueOnce(detailWith(null)) // First poll: not checked yet.
      .mockResolvedValueOnce(detailWith(1000)); // Second poll: checked.

    await useProductsStore
      .getState()
      .addOffer(1, { url: 'https://a.es/x', currency: 'EUR' });
    expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS);
    expect(productsApi.get).toHaveBeenCalledTimes(2);
    expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS);
    expect(productsApi.get).toHaveBeenCalledTimes(3);
    expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(2);
    expect(
      useProductsStore.getState().details[1].data.offers[0].last_checked_at
    ).toBe(1000);

    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS * 5);
    expect(productsApi.get).toHaveBeenCalledTimes(3);
  });

  it('stops polling after the last attempt', async () => {
    offersApi.add.mockResolvedValue({ id: 9 });
    productsApi.get.mockResolvedValue(detailWith(null));

    await useProductsStore
      .getState()
      .addOffer(1, { url: 'https://a.es/x', currency: 'EUR' });
    await vi.advanceTimersByTimeAsync(
      PRICE_CHECK_POLL_MS * (PRICE_CHECK_MAX_POLLS + 5)
    );

    expect(productsApi.get).toHaveBeenCalledTimes(1 + PRICE_CHECK_MAX_POLLS);
  });

  it('stops polling when the product is gone', async () => {
    offersApi.add.mockResolvedValue({ id: 9 });
    productsApi.get
      .mockResolvedValueOnce(detailWith(null))
      .mockRejectedValueOnce(new ApiErrorLike('Not found', 404));

    await useProductsStore
      .getState()
      .addOffer(1, { url: 'https://a.es/x', currency: 'EUR' });
    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS * 5);

    expect(productsApi.get).toHaveBeenCalledTimes(2);
  });

  it('create watches the new product until its first store has a price', async () => {
    productsApi.create.mockResolvedValue({ id: 1, offers: [{ id: 9 }] });
    productsApi.get.mockResolvedValue(detailWith(1000));

    await useProductsStore.getState().create({ name: 'New' });
    expect(productsApi.get).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS);
    expect(productsApi.get).toHaveBeenCalledTimes(1);
    expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(2);
    expect(useProductsStore.getState().details[1].data).toEqual(
      detailWith(1000)
    );
  });

  it('updateOffer waits for a price newer than the one before the edit', async () => {
    useProductsStore.setState({
      details: { 1: { status: 'success', error: null, data: detailWith(500) } }
    });
    offersApi.update.mockResolvedValue({ id: 9 });
    productsApi.get
      .mockResolvedValueOnce(detailWith(500)) // Refresh right after the edit.
      .mockResolvedValueOnce(detailWith(500)) // First poll: old record.
      .mockResolvedValueOnce(detailWith(1000)); // Second poll: new record.

    await useProductsStore
      .getState()
      .updateOffer(1, 9, { url: 'https://b.es/x' });
    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS);
    expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PRICE_CHECK_POLL_MS);
    expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(2);
    expect(
      useProductsStore.getState().details[1].data.offers[0].last_checked_at
    ).toBe(1000);
  });
});
