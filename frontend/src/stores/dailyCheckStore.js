import { create } from 'zustand';
import { dailyCheck as dailyCheckApi } from '@/lib/api';

/**
 * The store's state before any action has run. Exported so tests can reset
 * the store between cases with `useDailyCheckStore.setState(initialDailyCheckState)`.
 */
export const initialDailyCheckState = {
  /** @type {'idle'|'loading'|'success'|'error'} Status of the last `fetch()` call. */
  status: 'idle',
  /** @type {object|null} Last `GET /daily-check/` response. */
  data: null
};

/**
 * Zustand store for today's daily price check status, shown by the
 * dashboard's `DailyCheckNotice`. A failed request only logs: the notice is
 * informative and must never get in the way of the dashboard.
 */
export const useDailyCheckStore = create((set) => ({
  ...initialDailyCheckState,

  /** (Re)load today's status. */
  async fetch() {
    set({ status: 'loading' });
    try {
      const data = await dailyCheckApi.get();
      set({ status: 'success', data });
    } catch (err) {
      console.error('Error fetching the daily check status:', err);
      set({ status: 'error', data: null });
    }
  }
}));
