import { useMemo } from 'react';
import { Box, Card, Flex, Heading, Text } from '@chakra-ui/react';
import { useReducedMotion } from 'motion/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatDate, formatPercent, formatPrice } from '@/lib/format';
import { durationSeconds } from '@/theme/motion';
import { RANGE_ALL, RANGE_OPTIONS } from '@/lib/productHistory';

/**
 * The chart's custom tooltip: date, price, change versus the previous point
 * and stock status, per the brief (no legend, this is the only place stock
 * per-point is surfaced on the chart).
 */
const ChartTooltip = ({ active, payload, currency, locale, t }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

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
 * the line chart itself (or a "tracking just started" message when there is
 * not enough history yet) with a dashed average reference line, a
 * timestamp-keyed marker for the range's lowest price, and shaded bands for
 * out-of-stock periods. No legend (the tooltip and the stats row above
 * already carry that context). All chart inputs are pre-computed by the
 * caller from `src/lib/productHistory.js` so this component stays about
 * rendering, not math.
 *
 * @param {object} props
 * @param {string} props.range - The selected range (`RANGE_OPTIONS` value or `RANGE_ALL`).
 * @param {(range: string) => void} props.onRangeChange
 * @param {Array<{timestamp: number, price: number, isInStock: boolean, changePercent: number|null}>} props.chartPoints
 * @param {[number, number]|['auto','auto']} props.yDomain
 * @param {Array<{x1: number, x2: number}>} props.outOfStockBands
 * @param {number|null} props.average
 * @param {{price: number, timestamp: number}|null} props.lowest
 * @param {boolean} props.hasEnoughHistory
 * @param {number|null} props.trackingStartDate - Seconds since epoch.
 * @param {string} props.currency - ISO 4217 currency code.
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 */
export const PriceHistoryChart = ({
  range,
  onRangeChange,
  chartPoints,
  yDomain,
  outOfStockBands,
  average,
  lowest,
  hasEnoughHistory,
  trackingStartDate,
  currency,
  locale
}) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  const rangeItems = useMemo(
    () => [
      ...RANGE_OPTIONS.map((days) => ({
        value: days,
        label: t('pages.product.chart.rangeOption', { days })
      })),
      { value: RANGE_ALL, label: t('pages.product.chart.rangeAll') }
    ],
    [t]
  );

  return (
    <Card.Root shadow="sm">
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
          <SegmentedControl
            items={rangeItems}
            value={range}
            onValueChange={(e) => onRangeChange(e.value)}
            size="sm"
          />
        </Flex>

        {hasEnoughHistory ? (
          <Box height="300px" width="100%">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartPoints}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chakra-colors-border)"
                />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
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
                  content={
                    <ChartTooltip currency={currency} locale={locale} t={t} />
                  }
                />
                {outOfStockBands.map((band) => (
                  <ReferenceArea
                    key={`${band.x1}-${band.x2}`}
                    x1={band.x1}
                    x2={band.x2}
                    fill="var(--chakra-colors-stock-out)"
                    fillOpacity={0.12}
                    stroke="none"
                    ifOverflow="visible"
                  />
                ))}
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
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--chakra-colors-fg)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  isAnimationActive={!shouldReduceMotion}
                  animationDuration={durationSeconds.normal * 1000}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Text color="fg.muted" textAlign="center" py="12">
            {t('pages.product.chart.empty', {
              date: trackingStartDate
                ? formatDate(trackingStartDate, locale)
                : '-'
            })}
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  );
};
