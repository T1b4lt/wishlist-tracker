import { useEffect } from 'react';
import { Alert } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/lib/format';
import { useDailyCheckStore } from '@/stores/dailyCheckStore';

/**
 * Dashboard notice for days the Gemini quota ran out during the daily price
 * check: when it happened and how many products were left, plus how many
 * are still pending the 10-minute retries (or that all were checked).
 * Renders nothing on a normal day, before today's check or if the status
 * cannot be loaded. Refetched on mount and whenever the window regains focus.
 *
 * @param {object} props
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 * @param {string} [props.timeZone] - IANA time zone; the browser's by default
 *   (set in tests for deterministic times).
 */
export const DailyCheckNotice = ({ locale, timeZone }) => {
  const { t } = useTranslation();
  const data = useDailyCheckStore((state) => state.data);
  const fetchStatus = useDailyCheckStore((state) => state.fetch);

  useEffect(() => {
    fetchStatus();
    const handleFocus = () => fetchStatus();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchStatus]);

  if (!data?.limit_reached_at) return null;

  const time = formatTime(data.limit_reached_at, locale, timeZone);
  const isPending = data.pending_now > 0;

  return (
    <Alert.Root status={isPending ? 'warning' : 'success'} mb={6}>
      <Alert.Indicator />
      <Alert.Content>
        {isPending ? (
          <>
            <Alert.Title>
              {t('pages.dashboard.dailyCheck.limitReached', {
                time,
                count: data.pending_at_limit
              })}
            </Alert.Title>
            <Alert.Description>
              {t('pages.dashboard.dailyCheck.stillPending', {
                count: data.pending_now
              })}
            </Alert.Description>
          </>
        ) : (
          <Alert.Title>
            {t('pages.dashboard.dailyCheck.allChecked', { time })}
          </Alert.Title>
        )}
      </Alert.Content>
    </Alert.Root>
  );
};
