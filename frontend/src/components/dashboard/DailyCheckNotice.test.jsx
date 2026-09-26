import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyCheck as dailyCheckApi } from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import {
  initialDailyCheckState,
  useDailyCheckStore
} from '@/stores/dailyCheckStore';
import { DailyCheckNotice } from './DailyCheckNotice';

vi.mock('@/lib/api', () => ({ dailyCheck: { get: vi.fn() } }));

const status = (overrides) => ({
  day_start: Date.UTC(2026, 8, 26) / 1000,
  started_at: Date.UTC(2026, 8, 26, 12, 0) / 1000,
  total_products: 40,
  limit_reached_at: Date.UTC(2026, 8, 26, 12, 3) / 1000,
  pending_at_limit: 15,
  pending_now: 12,
  ...overrides
});

let consoleErrorSpy;

beforeEach(() => {
  useDailyCheckStore.setState(initialDailyCheckState);
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('DailyCheckNotice', () => {
  it('warns while products are still pending', async () => {
    dailyCheckApi.get.mockResolvedValue(status());
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Gemini limit reached at 12:03 with 15 products left to check today.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('12 still pending, retrying every 10 minutes.')
    ).toBeInTheDocument();
  });

  it('confirms when the retries finished every product', async () => {
    dailyCheckApi.get.mockResolvedValue(status({ pending_now: 0 }));
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Gemini limit reached at 12:03; all products were checked by retrying.'
      )
    ).toBeInTheDocument();
  });

  it('renders nothing on a day without a limit', async () => {
    dailyCheckApi.get.mockResolvedValue(
      status({ limit_reached_at: null, pending_at_limit: null, pending_now: 0 })
    );
    renderWithProviders(<DailyCheckNotice locale="en-GB" />);

    await waitFor(() =>
      expect(useDailyCheckStore.getState().status).toBe('success')
    );
    expect(screen.queryByText(/Gemini limit reached/)).not.toBeInTheDocument();
  });

  it('renders nothing when the status request fails', async () => {
    dailyCheckApi.get.mockRejectedValue(new Error('boom'));
    renderWithProviders(<DailyCheckNotice locale="en-GB" />);

    await waitFor(() =>
      expect(useDailyCheckStore.getState().status).toBe('error')
    );
    expect(screen.queryByText(/Gemini limit reached/)).not.toBeInTheDocument();
  });

  it('refetches when the window regains focus', async () => {
    dailyCheckApi.get.mockResolvedValue(status());
    renderWithProviders(<DailyCheckNotice locale="en-GB" />);
    await waitFor(() => expect(dailyCheckApi.get).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(dailyCheckApi.get).toHaveBeenCalledTimes(2));
  });
});
