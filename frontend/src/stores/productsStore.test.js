import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { products as productsApi } from '@/lib/api';
import { useProductsStore, initialProductsState } from './productsStore';

vi.mock('@/lib/api', () => ({
  products: {
    dashboardSummary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    get: vi.fn()
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
    it('updates the product and refetches the summary', async () => {
      productsApi.update.mockResolvedValue({ id: 5, name: 'Renamed' });
      productsApi.dashboardSummary.mockResolvedValue([
        { id: 5, name: 'Renamed' }
      ]);

      const updated = await useProductsStore
        .getState()
        .update(5, { name: 'Renamed' });

      expect(productsApi.update).toHaveBeenCalledWith(5, { name: 'Renamed' });
      expect(productsApi.dashboardSummary).toHaveBeenCalledTimes(1);
      expect(updated).toEqual({ id: 5, name: 'Renamed' });
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
