import { useMemo } from 'react';
import { Box, Card, Flex, Heading, HStack, Text } from '@chakra-ui/react';
import { useReducedMotion } from 'motion/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StoreBadge } from '@/components/common';
import { formatDate, formatPercent, formatPrice } from '@/lib/format';
import { durationSeconds } from '@/theme/motion';
import { RANGE_ALL } from '@/lib/productHistory';

/**
 * The chart's custom tooltip for the hovered store's point: store (when
 * there are several), date, price, change versus the previous point and
 * stock status.
 */
const ChartTooltip = ({ active, payload, currency, locale, t, showStore }) => {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const point = entry.payload;

  return (
    <Box
      bg="bg.inverted"
      color="fg.inverted"
      px={3}
      py={2}
      borderRadius="md"
      boxShadow="md"
      fontSize="sm"
    >
      {showStore && (
        <Text>
          {t('pages.product.chart.tooltip.store')}: {entry.name}
        </Text>
      )}
      <Text fontWeight="semibold" mb={1}>
        {formatDate(point.timestamp, locale)}
      </Text>
      <Text>
        {t('pages.product.chart.tooltip.price')}:{' '}
        {formatPrice(point.price, currency, locale)}
      </Text>
      <Text>
        {t('pages.product.chart.tooltip.change')}:{' '}
        {point.changePercent === null
          ? t('common.messages.notAvailable')
          : formatPercent(point.changePercent, locale, {
              signDisplay: 'exceptZero'
            })}
      </Text>
      <Text>
        {t('pages.product.chart.tooltip.stock')}:{' '}
        {point.isInStock
          ? t('common.status.inStock')
          : t('common.status.outOfStock')}
      </Text>
    </Box>
  );
};

/**
 * The product detail page's price history chart card: a day-range selector,
 * the chart itself (or a "tracking just started" message when there is
 * not enough history yet): one stepped line per store, dashed while that
 * store is out of stock, with a dashed average reference line (of the best
 * store) and a timestamp-keyed marker for the range's lowest price. With
 * more than one store, a legend (favicon + name) names each line. All chart
 * inputs are pre-computed by the caller from `src/lib/offerChart.js` and
 * `src/lib/productHistory.js` so this component stays about rendering, not
 * math.
 *
 * @param {object} props
 * @param {string[]} props.rangeKeys - The backend's range keys
 *   (`ProductDetailResponse.ranges[].key`), in display order.
 * @param {string} props.range - The selected range key.
 * @param {(range: string) => void} props.onRangeChange
 * @param {object[]} props.series - One entry per store, see `buildOfferSeries`.
 * @param {[number, number]|['auto','auto']} props.yDomain
 * @param {number|null} props.average - The backend's average for the
 *   selected range (`ranges[].average`).
 * @param {{price: number, timestamp: number}|null} props.lowest - The
 *   backend's lowest price of the selected range (`ranges[].lowest`).
 * @param {boolean} props.hasEnoughHistory - Whether the selected range has
 *   enough points to plot.
 * @param {boolean} [props.hasEnoughTotalHistory] - Whether the product's
 *   whole history (all ranges) has enough points to plot. When the range is
 *   too narrow but this is `true`, a "not enough data in this range" message
 *   is shown instead of "tracking started". Defaults to `hasEnoughHistory`.
 * @param {number|null} props.trackingStartDate - Seconds since epoch.
 * @param {string} props.currency - ISO 4217 currency code.
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 */
export const PriceHistoryChart = ({
  rangeKeys,
  range,
  onRangeChange,
  series,
  yDomain,
  average,
  lowest,
  hasEnoughHistory,
  hasEnoughTotalHistory = hasEnoughHistory,
  trackingStartDate,
  currency,
  locale
}) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  const rangeItems = useMemo(
    () =>
      rangeKeys.map((key) =>
        key === RANGE_ALL
          ? { value: key, label: t('pages.product.chart.rangeAll') }
          : {
              value: key,
              label: t('pages.product.chart.rangeOption', { days: key })
            }
      ),
    [rangeKeys, t]
  );

  return (
    <Card.Root>
      <Card.Body>
        <Flex
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={3}
          mb={4}
        >
          <Heading textStyle="heading.sm">
            {t('pages.product.chart.title')}
          </Heading>
          {/* The 5 range options (30/60/90/180 days + All) don't wrap onto a
              second line as a group, so their combined natural width can
              exceed the viewport below `md` (e.g. ~432px at 390px wide):
              `overflowX="auto"` keeps that overflow local to the control
              (still fully reachable by scrolling/swiping it) instead of
              widening the whole page. */}
          <Box maxW="100%" overflowX="auto">
            <SegmentedControl
              items={rangeItems}
              value={range}
              onValueChange={(e) => onRangeChange(e.value)}
              size="sm"
            />
          </Box>
        </Flex>

        {hasEnoughHistory ? (
          <Box height="300px" width="100%">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chakra-colors-border)"
                />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  allowDuplicatedCategory={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'var(--chakra-colors-fg-muted)',
                    fontSize: 12
                  }}
                  tickFormatter={(ts) => formatDate(ts, locale)}
                  dy={10}
                />
                <YAxis
                  domain={yDomain}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'var(--chakra-colors-fg-muted)',
                    fontSize: 12
                  }}
                  tickFormatter={(value) =>
                    formatPrice(value, currency, locale)
                  }
                  width={80}
                />
                <Tooltip
                  shared={false}
                  content={
                    <ChartTooltip
                      currency={currency}
                      locale={locale}
                      t={t}
                      showStore={series.length > 1}
                    />
                  }
                />
                {average !== null && (
                  <ReferenceLine
                    y={average}
                    stroke="var(--chakra-colors-fg-muted)"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{
                      value: t('pages.product.chart.average'),
                      position: 'insideTopRight',
                      fill: 'var(--chakra-colors-fg-muted)',
                      fontSize: 12,
                      fontWeight: 500
                    }}
                  />
                )}
                {lowest && (
                  <ReferenceLine
                    x={lowest.timestamp}
                    stroke="var(--chakra-colors-fg)"
                    strokeWidth={1.5}
                    label={{
                      value: t('pages.product.chart.lowest'),
                      position: 'insideTopLeft',
                      fill: 'var(--chakra-colors-fg)',
                      fontSize: 12,
                      fontWeight: 500
                    }}
                  />
                )}
                {/* Prices change at discrete checks, so draw steps rather
                    than a smoothed curve; each store gets a solid line while
                    in stock and a dashed one while out of stock. */}
                {series.flatMap((s) => [
                  <Line
                    key={`${s.offerId}-in`}
                    data={s.points}
                    name={s.storeName ?? ''}
                    type="stepAfter"
                    dataKey="inStockPrice"
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={!shouldReduceMotion}
                    animationDuration={durationSeconds.normal * 1000}
                  />,
                  <Line
                    key={`${s.offerId}-out`}
                    data={s.points}
                    name={s.storeName ?? ''}
                    type="stepAfter"
                    dataKey="outOfStockPrice"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={!shouldReduceMotion}
                    animationDuration={durationSeconds.normal * 1000}
                  />
                ])}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Text color="fg.muted" textAlign="center" py="12">
            {hasEnoughTotalHistory
              ? t('pages.product.chart.emptyRange')
              : t('pages.product.chart.empty', {
                  date: trackingStartDate
                    ? formatDate(trackingStartDate, locale)
                    : '-'
                })}
          </Text>
        )}

        {hasEnoughHistory && series.length > 1 && (
          <HStack
            as="ul"
            aria-label={t('pages.product.chart.legendLabel')}
            gap={4}
            wrap="wrap"
            mt={3}
            listStyleType="none"
          >
            {series.map((s) => (
              <HStack as="li" key={s.offerId} gap={1.5}>
                <Box w="12px" h="2px" bg={s.color} aria-hidden="true" />
                <StoreBadge
                  storeId={s.storeId}
                  name={s.storeName}
                  hasFavicon={s.hasFavicon}
                />
              </HStack>
            ))}
          </HStack>
        )}
      </Card.Body>
    </Card.Root>
  );
};
