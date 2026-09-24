import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categories as categoriesApi } from '@/lib/api';
import { useCategoriesStore, initialCategoriesState } from './categoriesStore';

vi.mock('@/lib/api', () => ({
  categories: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
  useCategoriesStore.setState(initialCategoriesState);
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('useCategoriesStore', () => {
  it('starts idle with an empty items list', () => {
    const state = useCategoriesStore.getState();
    expect(state.status).toBe('idle');
    expect(state.items).toEqual([]);
    expect(state.error).toBeNull();
  });

  describe('fetch', () => {
    it('transitions idle -> loading -> success and stores items', async () => {
      let resolveRequest;
      categoriesApi.list.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );

      const promise = useCategoriesStore.getState().fetch();
      expect(useCategoriesStore.getState().status).toBe('loading');

      resolveRequest([{ id: 1, name: 'Electronics', product_count: 3 }]);
      await promise;

      const state = useCategoriesStore.getState();
      expect(state.status).toBe('success');
      expect(state.items).toEqual([
        { id: 1, name: 'Electronics', product_count: 3 }
      ]);
    });

    it('transitions to error, normalizes the error and logs it', async () => {
      const err = new ApiErrorLike('boom', 500);
      categoriesApi.list.mockRejectedValue(err);

      await useCategoriesStore.getState().fetch();

      const state = useCategoriesStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toEqual({ status: 500, message: 'boom' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), err);
    });

    it('normalizes a non-ApiError failure with a null status', async () => {
      categoriesApi.list.mockRejectedValue(new Error('network down'));

      await useCategoriesStore.getState().fetch();

      expect(useCategoriesStore.getState().error).toEqual({
        status: null,
        message: 'network down'
      });
    });
  });

  describe('create', () => {
    it('creates the category and refetches the list', async () => {
      categoriesApi.create.mockResolvedValue({ id: 2, name: 'Books' });
      categoriesApi.list.mockResolvedValue([
        { id: 2, name: 'Books', product_count: 0 }
      ]);

      const created = await useCategoriesStore
        .getState()
        .create({ name: 'Books', color: '#000' });

      expect(categoriesApi.create).toHaveBeenCalledWith({
        name: 'Books',
        color: '#000'
      });
      expect(categoriesApi.list).toHaveBeenCalledTimes(1);
      expect(created).toEqual({ id: 2, name: 'Books' });
      expect(useCategoriesStore.getState().items).toEqual([
        { id: 2, name: 'Books', product_count: 0 }
      ]);
    });
  });

  describe('update', () => {
    it('updates the category and refetches the list', async () => {
      categoriesApi.update.mockResolvedValue({ id: 2, name: 'Renamed' });
      categoriesApi.list.mockResolvedValue([
        { id: 2, name: 'Renamed', product_count: 0 }
      ]);

      const updated = await useCategoriesStore
        .getState()
        .update(2, { name: 'Renamed' });

      expect(categoriesApi.update).toHaveBeenCalledWith(2, {
        name: 'Renamed'
      });
      expect(categoriesApi.list).toHaveBeenCalledTimes(1);
      expect(updated).toEqual({ id: 2, name: 'Renamed' });
    });
  });

  describe('remove', () => {
    it('deletes the category and refetches the list', async () => {
      categoriesApi.remove.mockResolvedValue(null);
      categoriesApi.list.mockResolvedValue([]);

      await useCategoriesStore.getState().remove(2);

      expect(categoriesApi.remove).toHaveBeenCalledWith(2);
      expect(categoriesApi.list).toHaveBeenCalledTimes(1);
      expect(useCategoriesStore.getState().items).toEqual([]);
    });

    it('propagates a 400 ApiError untouched (category in use) and does not refetch', async () => {
      categoriesApi.remove.mockRejectedValue(
        new ApiErrorLike('category in use', 400)
      );

      await expect(
        useCategoriesStore.getState().remove(2)
      ).rejects.toMatchObject({ status: 400, message: 'category in use' });
      expect(categoriesApi.list).not.toHaveBeenCalled();
    });
  });
});
