import { Flex, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { PriceChange } from '@/components/common';
import { formatDate, formatPrice } from '@/lib/format';

/**
 * One plain stat: a small muted label above a bold numeric value (or a short
 * stack of values). No card/border per stat, no uppercase eyebrow, matching
 * the dashboard's summary strip (`DashboardSummary`).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {import('react').ReactNode} props.children
 */
const Stat = ({ label, children }) => (
  <VStack align="flex-start" gap={0.5} minW="fit-content">
    <Text textStyle="caption" color="fg.muted">
      {label}
    </Text>
    {children}
  </VStack>
);

/**
 * The product detail page's stats row: current price, lowest price in the
 * selected range (with the date it was reached), average price in the
 * selected range, and how the current price compares to that average.
 * Every range-dependent value follows the chart's range selector (its caller
 * recomputes `lowest`/`average`/`currentVsAverage` from the range-filtered
 * history via `src/lib/productHistory.js`).
 *
 * @param {object} props
 * @param {number|null|undefined} props.currentPrice
 * @param {string} props.currency - ISO 4217 currency code.
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 * @param {{price: number, timestamp: number}|null} props.lowest
 * @param {number|null} props.average
 * @param {number|null} props.currentVsAverage
 */
export const ProductStatsRow = ({
  currentPrice,
  currency,
  locale,
  lowest,
  average,
  currentVsAverage
}) => {
  const { t } = useTranslation();

  return (
    <Flex wrap="wrap" gap={{ base: 6, md: 10 }}>
      <Stat label={t('pages.product.stats.currentPrice')}>
        <Text textStyle="numeric" fontSize="xl" fontWeight="semibold">
          {formatPrice(currentPrice, currency, locale)}
        </Text>
      </Stat>

      <Stat label={t('pages.product.stats.lowestInRange')}>
        <Text textStyle="numeric" fontSize="xl" fontWeight="semibold">
          {lowest ? formatPrice(lowest.price, currency, locale) : '-'}
        </Text>
        {lowest && (
          <Text textStyle="caption" color="fg.subtle">
            {t('pages.product.stats.lowestReachedOn', {
              date: formatDate(lowest.timestamp, locale)
            })}
          </Text>
        )}
      </Stat>

      <Stat label={t('pages.product.stats.averageInRange')}>
        <Text textStyle="numeric" fontSize="xl" fontWeight="semibold">
          {average !== null ? formatPrice(average, currency, locale) : '-'}
        </Text>
      </Stat>

      <Stat label={t('pages.product.stats.currentVsAverage')}>
        <PriceChange
          value={currentVsAverage}
          locale={locale}
          fontSize="xl"
          fontWeight="semibold"
        />
      </Stat>
    </Flex>
  );
};
