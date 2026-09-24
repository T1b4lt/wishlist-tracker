import { useEffect, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Card,
  Flex,
  Button,
  Stack
} from '@chakra-ui/react';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  LuArrowLeft,
  LuExternalLink,
  LuTrendingUp,
  LuTrendingDown,
  LuMinus
} from 'react-icons/lu';
import { getCurrencySymbol } from '@/lib/web_utils';
import { formatDate, formatPrice, getLocale, getTrend } from '@/lib/format';
import {
  ErrorState,
  LoadingState,
  PriorityBadge,
  CategoryTag,
  StockStatus
} from '@/components/common';
import {
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '@/stores/configStore';
import { useProductsStore } from '@/stores/productsStore';

const ProductPage = () => {
  const params = useParams();
  const productId = params.productId;
  const { t, i18n } = useTranslation();
  const locale = useMemo(() => getLocale(i18n.language), [i18n.language]);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetch);
  const histWindowSize = config?.hist_window_size ?? 60;

  const detail = useProductsStore((state) => state.details[productId]);
  const fetchDetail = useProductsStore((state) => state.fetchDetail);

  const status = detail?.status ?? 'idle';
  const product = detail?.data ?? null;
  const isLoading = status === 'loading' || status === 'idle';

  useDocumentTitle(
    product?.name ??
      (isLoading
        ? t('common.messages.loading')
        : t('pages.product.error.title'))
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchDetail(productId);
  }, [fetchDetail, productId]);

  const calculatePriceChange = () => {
    if (!product || !product.current_price || !product.min_price) return null;
    const change =
      ((product.current_price - product.min_price) / product.min_price) * 100;
    return change;
  };

  // Prepare chart data from the last hist_window_size records
  const getChartData = () => {
    if (
      !product ||
      !product.price_history ||
      product.price_history.length === 0
    ) {
      return [];
    }

    // Get the last hist_window_size records
    const recentHistory = product.price_history.slice(-histWindowSize);

    return recentHistory.map((record) => ({
      date: formatDate(record.timestamp, locale),
      timestamp: record.timestamp,
      price: record.price
    }));
  };

  // Calculate average price from chart data
  const getAveragePrice = () => {
    const chartData = getChartData();
    if (chartData.length === 0) return null;

    const sum = chartData.reduce((acc, record) => acc + record.price, 0);
    return sum / chartData.length;
  };

  // Find the date when minimum price was reached
  const getMinPriceDate = () => {
    if (
      !product ||
      !product.price_history ||
      product.price_history.length === 0
    ) {
      return null;
    }

    const recentHistory = product.price_history.slice(-histWindowSize);
    const minPriceRecord = recentHistory.reduce(
      (min, record) => (record.price < min.price ? record : min),
      recentHistory[0]
    );

    return formatDate(minPriceRecord.timestamp, locale);
  };

  const getMinPriceDateLong = () => {
    if (
      !product ||
      !product.price_history ||
      product.price_history.length === 0
    ) {
      return null;
    }

    const recentHistory = product.price_history.slice(-histWindowSize);
    const minPriceRecord = recentHistory.reduce(
      (min, record) => (record.price < min.price ? record : min),
      recentHistory[0]
    );

    return formatDate(minPriceRecord.timestamp, locale, 'long');
  };

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState minH="400px" />
      </PageContainer>
    );
  }

  if (status === 'error' || !product) {
    const notFound = detail?.error?.status === 404;
    return (
      <PageContainer>
        <Card.Root>
          <Card.Body>
            <ErrorState
              title={t('pages.product.error.title')}
              message={
                notFound
                  ? t('pages.product.errors.notFound')
                  : t('pages.product.errors.fetchFailed')
              }
              onRetry={() => fetchDetail(productId)}
            />
            <Flex justify="center" mt={2}>
              <Link href="/">
                <Button variant="outline">
                  <LuArrowLeft />
                  {t('common.actions.backToDashboard')}
                </Button>
              </Link>
            </Flex>
          </Card.Body>
        </Card.Root>
      </PageContainer>
    );
  }

  const priceChange = calculatePriceChange();

  const calculateTrend = () => {
    const direction = getTrend(priceChange);
    if (direction === 'up') return { icon: LuTrendingUp, color: 'price.up' };
    if (direction === 'down')
      return { icon: LuTrendingDown, color: 'price.down' };
    return { icon: LuMinus, color: 'price.flat' };
  };

  const TrendIcon = calculateTrend().icon;
  const trendColor = calculateTrend().color;

  const chartData = getChartData();
  const averagePrice = getAveragePrice();
  const minPriceDate = getMinPriceDate();

  return (
    <PageContainer>
      <PageHeader
        title={product.name}
        backLink={{ href: '/', label: t('common.actions.backToWishlist') }}
        actions={
          <a href={product.url} target="_blank" rel="noopener noreferrer">
            <Button variant="solid" size="lg">
              <LuExternalLink />
              {t('common.actions.viewOnline')}
            </Button>
          </a>
        }
      />
      <VStack gap="6" align="stretch">
        <HStack gap="3" wrap="wrap">
          <CategoryTag
            name={product.category_name}
            color={product.category_color}
          />
          <PriorityBadge priority={product.priority} />
          <StockStatus inStock={product.is_in_stock} />
        </HStack>

        {/* Stats Section */}
        <Card.Root variant="elevated">
          <Card.Body>
            <Stack
              direction={{ base: 'column', md: 'row' }}
              gap={{ base: 8, md: 12 }}
              divideX={{ base: '0', md: '1px' }}
              divideY={{ base: '1px', md: '0' }}
              borderColor="border"
            >
              <Box flex="1" pl={{ base: 0, md: 0 }} pt={{ base: 0, md: 0 }}>
                <Text
                  fontSize="sm"
                  fontWeight="semibold"
                  color="fg.muted"
                  mb="2"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  {t('pages.product.price.current')}
                </Text>
                <Heading size="3xl" color="fg">
                  {formatPrice(product.current_price, product.currency, locale)}
                </Heading>
              </Box>

              <Box flex="1" pl={{ base: 0, md: 8 }} pt={{ base: 6, md: 0 }}>
                <Text
                  fontSize="sm"
                  fontWeight="semibold"
                  color="fg.muted"
                  mb="2"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  {t('pages.product.price.min', { days: histWindowSize })}
                </Text>
                <Flex align="baseline" gap="3">
                  <Heading size="xl">
                    {formatPrice(product.min_price, product.currency, locale)}
                  </Heading>
                  {priceChange !== null && (
                    <Flex
                      align="center"
                      gap={1}
                      color={trendColor}
                      fontWeight="bold"
                      bg="bg.muted"
                      px={2}
                      py={1}
                      borderRadius="md"
                      fontSize="sm"
                    >
                      <TrendIcon size={14} />
                      <Text>
                        {new Intl.NumberFormat(locale, {
                          style: 'percent',
                          minimumFractionDigits: 1
                        }).format(Math.abs(priceChange) / 100)}
                      </Text>
                    </Flex>
                  )}
                </Flex>
                {getMinPriceDateLong() && (
                  <Text fontSize="sm" color="fg.subtle" mt={1}>
                    {t('pages.product.price.minReached', {
                      date: getMinPriceDateLong()
                    })}
                  </Text>
                )}
              </Box>

              <Box flex="1" pl={{ base: 0, md: 8 }} pt={{ base: 6, md: 0 }}>
                <Text
                  fontSize="sm"
                  fontWeight="semibold"
                  color="fg.muted"
                  mb="2"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  {t('pages.product.price.average')}
                </Text>
                <Heading size="xl" color="fg.muted">
                  {averagePrice
                    ? formatPrice(averagePrice, product.currency, locale)
                    : '-'}
                </Heading>
              </Box>
            </Stack>
          </Card.Body>
        </Card.Root>

        {/* Description */}
        {product.description && (
          <Box px={2}>
            <Heading
              size="sm"
              mb="2"
              color="fg.muted"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {t('pages.product.description')}
            </Heading>
            <Text color="fg" lineHeight="relaxed" fontSize="md">
              {product.description}
            </Text>
          </Box>
        )}

        {/* Price history chart */}
        <Card.Root variant="elevated">
          <Card.Body>
            <Heading size="md" mb="4">
              {t('pages.product.priceHistory.title')}
            </Heading>
            {chartData.length > 0 ? (
              <Box height="300px" width="100%">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorPrice"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--chakra-colors-fg)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--chakra-colors-fg)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--chakra-colors-border)"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: 'var(--chakra-colors-fg-muted)',
                        fontSize: 12
                      }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: 'var(--chakra-colors-fg-muted)',
                        fontSize: 12
                      }}
                      tickFormatter={(value) =>
                        `${value.toFixed(0)} ${getCurrencySymbol(
                          product.currency
                        )}`
                      }
                      dx={-10}
                    />
                    <Tooltip
                      formatter={(value) => [
                        `${Number(value).toFixed(2)} ${getCurrencySymbol(
                          product.currency
                        )}`,
                        t('pages.product.priceHistory.tooltipPrice')
                      ]}
                      contentStyle={{
                        backgroundColor: 'var(--chakra-colors-bg-inverted)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'var(--chakra-colors-fg-inverted)',
                        boxShadow: 'var(--chakra-shadows-md)'
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      formatter={() =>
                        t('pages.product.priceHistory.legendPrice')
                      }
                    />

                    {/* Average price line */}
                    {averagePrice && (
                      <ReferenceLine
                        y={averagePrice}
                        stroke="var(--chakra-colors-fg-muted)"
                        strokeDasharray="5 5"
                        strokeWidth={1.5}
                        label={{
                          value: t('pages.product.priceHistory.avgReference', {
                            value: averagePrice.toFixed(2),
                            currency: getCurrencySymbol(product.currency)
                          }),
                          position: 'insideTopRight',
                          fill: 'var(--chakra-colors-fg-muted)',
                          fontSize: 12,
                          fontWeight: 500
                        }}
                      />
                    )}

                    {/* Min price date line */}
                    {minPriceDate && (
                      <ReferenceLine
                        x={minPriceDate}
                        stroke="var(--chakra-colors-fg)"
                        strokeWidth={1.5}
                        label={{
                          value: t('pages.product.priceHistory.minReference'),
                          position: 'insideTopLeft',
                          fill: 'var(--chakra-colors-fg)',
                          fontSize: 12,
                          fontWeight: 500
                        }}
                      />
                    )}

                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="var(--chakra-colors-fg)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      name={t('pages.product.priceHistory.legendPrice')}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text color="fg.muted" textAlign="center" py="8">
                {t('pages.product.priceHistory.empty')}
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      </VStack>
    </PageContainer>
  );
};

export default ProductPage;
