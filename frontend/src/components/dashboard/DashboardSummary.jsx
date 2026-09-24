import { Flex, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { Stagger, StaggerItem } from '@/components/motion';
import { formatPrice } from '@/lib/format';
import { computeDashboardSummary } from '@/lib/dashboardSummary';

/**
 * One plain stat: a small muted label above a bold numeric value (or a
 * short stack of values, for the per-currency totals). No card/border per
 * stat, per the visual direction.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {import('react').ReactNode} props.children - The value(s), each
 *   expected to already carry `textStyle="numeric"`.
 */
const Stat = ({ label, children }) => (
  <StaggerItem>
    <VStack align="flex-start" gap={0.5} minW="fit-content">
      <Text textStyle="caption" color="fg.muted">
        {label}
      </Text>
      {children}
    </VStack>
  </StaggerItem>
);

/**
 * The dashboard's summary strip: plain stats (no per-stat card) computed
 * from the dashboard-summary product list. Each stat hides itself when it
 * cannot be computed (see `computeDashboardSummary`); renders nothing at
 * all for an empty product list (the page shows `EmptyState` instead).
 *
 * @param {object} props
 * @param {import('@/lib/dashboardSummary').DashboardSummaryProduct[]} props.products
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 */
export const DashboardSummary = ({ products, locale }) => {
  const { t } = useTranslation();
  const { itemCount, totalsByCurrency, priceDropCount, atLowestCount } =
    computeDashboardSummary(products);

  if (itemCount === 0) return null;

  return (
    <Stagger>
      <Flex wrap="wrap" gap={{ base: 6, md: 10 }} mb={{ base: 6, md: 8 }}>
        <Stat label={t('pages.dashboard.summary.items')}>
          <Text textStyle="numeric" fontSize="xl" fontWeight="semibold">
            {itemCount}
          </Text>
        </Stat>

        {totalsByCurrency.length > 0 && (
          <Stat label={t('pages.dashboard.summary.totalValue')}>
            <VStack align="flex-start" gap={0}>
              {totalsByCurrency.map(({ currency, total }) => (
                <Text
                  key={currency}
                  textStyle="numeric"
                  fontSize="xl"
                  fontWeight="semibold"
                >
                  {formatPrice(total, currency, locale)}
                </Text>
              ))}
            </VStack>
          </Stat>
        )}

        {priceDropCount !== null && (
          <Stat label={t('pages.dashboard.summary.priceDrops')}>
            <Text textStyle="numeric" fontSize="xl" fontWeight="semibold">
              {priceDropCount}
            </Text>
          </Stat>
        )}

        {atLowestCount !== null && (
          <Stat label={t('pages.dashboard.summary.atLowest')}>
            <Text textStyle="numeric" fontSize="xl" fontWeight="semibold">
              {atLowestCount}
            </Text>
          </Stat>
        )}
      </Flex>
    </Stagger>
  );
};
