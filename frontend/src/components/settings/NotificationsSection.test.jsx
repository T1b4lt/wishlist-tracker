import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import { NotificationsSection } from './NotificationsSection';

vi.mock('@/lib/api', () => ({
  telegram: {
    getChatId: vi.fn(),
    sendTestMessage: vi.fn()
  },
  config: {
    get: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('@/components/ui/toaster', () => ({
  toaster: { create: vi.fn() }
}));

const baseProps = {
  telegramBotToken: 'saved-token',
  onTelegramBotTokenChange: vi.fn(),
  savedTelegramBotToken: 'saved-token',
  isTelegramBotTokenDirty: false,
  isPriceDropAlert: false,
  onPriceDropAlertChange: vi.fn(),
  isStockChangeAlert: false,
  onStockChangeAlertChange: vi.fn(),
  dailyCheckReport: 'limit_days',
  onDailyCheckReportChange: vi.fn()
};

const setStatus = (telegram_status) => {
  useConfigStore.setState({
    status: 'success',
    error: null,
    config: {
      selected_language: 'english',
      analysis_hour: 12,
      hist_window_size: 60,
      google_api_key: null,
      telegram_bot_token: 'saved-token',
      telegram_bot_chat_id: telegram_status === 'connected' ? '42' : null,
      is_price_drop_alert: false,
      is_stock_change_alert: false,
      daily_check_report: 'limit_days',
      telegram_status
    }
  });
};

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
});

describe('NotificationsSection', () => {
  it('disables every Telegram control and shows a reason when not connected', () => {
    setStatus('not_configured');
    renderWithProviders(<NotificationsSection {...baseProps} />);

    const switches = screen.getAllByRole('checkbox');
    expect(switches).toHaveLength(2);
    switches.forEach((s) => expect(s).toBeDisabled());
    expect(
      screen.getAllByText('Add a Telegram bot token to enable alerts')
    ).toHaveLength(3);
  });

  it('shows the "waiting for chat" reason when a token is saved but not linked', () => {
    setStatus('token_only');
    renderWithProviders(<NotificationsSection {...baseProps} />);

    expect(
      screen.getAllByText('Finish linking your Telegram chat to enable alerts')
    ).toHaveLength(3);
  });

  it('enables both alert switches once connected, with no reason shown', () => {
    setStatus('connected');
    renderWithProviders(<NotificationsSection {...baseProps} />);

    const switches = screen.getAllByRole('checkbox');
    switches.forEach((s) => expect(s).not.toBeDisabled());
    expect(
      screen.queryByText('Add a Telegram bot token to enable alerts')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Finish linking your Telegram chat to enable alerts')
    ).not.toBeInTheDocument();
  });

  it('disables the daily report select when not connected', () => {
    setStatus('not_configured');
    renderWithProviders(<NotificationsSection {...baseProps} />);

    expect(
      screen.getByRole('combobox', { name: 'Daily check report' })
    ).toBeDisabled();
  });

  it('reports the selected daily report mode', async () => {
    setStatus('connected');
    const onDailyCheckReportChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <NotificationsSection
        {...baseProps}
        onDailyCheckReportChange={onDailyCheckReportChange}
      />
    );

    await user.click(
      screen.getByRole('combobox', { name: 'Daily check report' })
    );
    await user.click(screen.getByRole('option', { name: 'Every day' }));

    expect(onDailyCheckReportChange).toHaveBeenCalledWith('every_day');
  });
});
