import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyCheck as dailyCheckApi } from '@/lib/api';
import { initialDailyCheckState, useDailyCheckStore } from './dailyCheckStore';

vi.mock('@/lib/api', () => ({ dailyCheck: { get: vi.fn() } }));

let consoleErrorSpy;

beforeEach(() => {
  useDailyCheckStore.setState(initialDailyCheckState);
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('useDailyCheckStore', () => {
  it('starts idle without data', () => {
    expect(useDailyCheckStore.getState()).toMatchObject({
      status: 'idle',
      data: null
    });
  });

  it('stores the fetched status', async () => {
    const data = { day_start: 1, pending_now: 2 };
    dailyCheckApi.get.mockResolvedValue(data);

    await useDailyCheckStore.getState().fetch();

    expect(useDailyCheckStore.getState()).toMatchObject({
      status: 'success',
      data
    });
  });

  it('keeps no data when the request fails', async () => {
    dailyCheckApi.get.mockRejectedValue(new Error('boom'));

    await useDailyCheckStore.getState().fetch();

    expect(useDailyCheckStore.getState()).toMatchObject({
      status: 'error',
      data: null
    });
  });
});
