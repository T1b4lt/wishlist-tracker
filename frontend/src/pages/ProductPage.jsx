import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Spinner,
  Card,
  Flex,
  Button,
  Stack
} from '@chakra-ui/react';
import { Tag } from '@/components/ui/tag';
import {
  LuArrowLeft,
  LuExternalLink,
  LuTrendingUp,
  LuTrendingDown,
  LuMinus
} from 'react-icons/lu';
import { getCurrencySymbol, getPriorityLabel } from '@/lib/web_utils';
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { API_URL } from '@/lib/api';

const ProductPage = () => {
  const params = useParams();
  const productId = params.productId;

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [histWindowSize, setHistWindowSize] = useState(60);
  const { t, i18n } = useTranslation();
  const locale = useMemo(
    () => (i18n.language === 'spanish' ? 'es-ES' : 'en-US'),
    [i18n.language]
  );

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/config/`);
      if (!response.ok) throw new Error('Failed to fetch config');
      const data = await response.json();
      setHistWindowSize(data.hist_window_size);
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  }, []);

  const fetchProductDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/products/${productId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t('pages.product.errors.notFound'));
        }
        throw new Error(t('pages.product.errors.fetchFailed'));
      }
      const data = await response.json();
      setProduct(data);
    } catch (error) {
      console.error('Error fetching product:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    // Fetch-on-mount: state is updated from the async request, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConfig();
    fetchProductDetail();
  }, [fetchConfig, fetchProductDetail]);

  const formatPrice = (price, currency) => {
    if (price === null || price === undefined) {
      return t('common.messages.notAvailable');
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }).format(price);
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateLong = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'red';
      case 'medium':
        return 'orange';
      case 'low':
        return 'green';
      default:
        return 'gray';
    }
  };

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
      date: formatDate(record.timestamp),
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

    return formatDate(minPriceRecord.timestamp);
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

    return formatDateLong(minPriceRecord.timestamp);
  };

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <Spinner size="xl" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box maxWidth="1200px" margin="0 auto" padding="6">
        <Card.Root>
          <Card.Body>
            <VStack gap="4" align="center" py="8">
              <Heading size="lg" color="red.500">
                {t('pages.product.error.title')}
              </Heading>
              <Text>{error}</Text>
              <Link href="/">
                <Button variant="outline">
                  <LuArrowLeft />
                  {t('common.actions.backToDashboard')}
                </Button>
              </Link>
            </VStack>
          </Card.Body>
        </Card.Root>
      </Box>
    );
  }

  if (!product) {
    return null;
  }

  const priceChange = calculatePriceChange();

  const calculateTrend = () => {
    if (priceChange === null) return { icon: LuMinus, color: 'gray.500' };
    if (priceChange > 0) return { icon: LuTrendingUp, color: 'red.500' };
    return { icon: LuTrendingDown, color: 'green.500' };
  };

  const TrendIcon = calculateTrend().icon;
  const trendColor = calculateTrend().color;

  const chartData = getChartData();
  const averagePrice = getAveragePrice();
  const minPriceDate = getMinPriceDate();

  return (
    <Box maxWidth="1200px" margin="0 auto" padding="6">
      <VStack gap="6" align="stretch">
        {/* Back button */}
        <Link href="/">
          <Button variant="ghost" size="sm">
            <LuArrowLeft />
            {t('common.actions.backToWishlist')}
          </Button>
        </Link>

        {/* Hero header */}
        <Box
          borderRadius="2xl"
          bgGradient="to-r, gray.800, gray.900"
          _dark={{ bgGradient: 'to-r, gray.800, gray.900' }}
          color="white"
          p={{ base: 6, md: 8 }}
          shadow="lg"
          position="relative"
          overflow="hidden"
        >
          {/* Subtle background glow */}
          <Box
            position="absolute"
            top="-50%"
            left="-10%"
            width="50%"
            height="200%"
            bgGradient="radial(circle, rgba(66,153,225,0.15) 0%, transparent 70%)"
            pointerEvents="none"
          />

          <VStack align="stretch" gap={6} position="relative" zIndex={1}>
            <Flex
              justify="space-between"
              align="flex-start"
              direction={{ base: 'column', md: 'row' }}
              gap={4}
            >
              <Box>
                <Heading size="3xl" mb="4" color="white" lineHeight="1.2">
                  {product.name}
                </Heading>
                <HStack gap="3" wrap="wrap">
                  <Tag
                    size="md"
                    variant="subtle"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: product.category_color,
                      borderWidth: '1px',
                      color: product.category_color
                    }}
                  >
                    {product.category_name}
                  </Tag>
                  <Tag
                    size="md"
                    variant="subtle"
                    colorPalette={getPriorityColor(product.priority)}
                  >
                    {getPriorityLabel(product.priority, t)}
                  </Tag>
                  <Tag
                    size="md"
                    variant="subtle"
                    colorPalette={product.is_in_stock ? 'green' : 'red'}
                  >
                    {product.is_in_stock
                      ? t('common.status.inStock')
                      : t('common.status.outOfStock')}
                  </Tag>
                </HStack>
              </Box>

              <a href={product.url} target="_blank" rel="noopener noreferrer">
                <Button variant="solid" size="lg" shadow="md">
                  <LuExternalLink />
                  {t('common.actions.viewOnline')}
                </Button>
              </a>
            </Flex>
          </VStack>
        </Box>

        {/* Stats Section */}
        <Card.Root variant="elevated">
          <Card.Body>
            <Stack
              direction={{ base: 'column', md: 'row' }}
              gap={{ base: 8, md: 12 }}
              divideX={{ base: '0', md: '1px' }}
              divideY={{ base: '1px', md: '0' }}
              borderColor="gray.200"
              _dark={{ borderColor: 'gray.700' }}
            >
              <Box flex="1" pl={{ base: 0, md: 0 }} pt={{ base: 0, md: 0 }}>
                <Text
                  fontSize="sm"
                  fontWeight="semibold"
                  color="gray.500"
                  mb="2"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  {t('pages.product.price.current')}
                </Text>
                <Heading
                  size="3xl"
                  color="blue.500"
                  _dark={{ color: 'blue.400' }}
                >
                  {formatPrice(product.current_price, product.currency)}
                </Heading>
              </Box>

              <Box flex="1" pl={{ base: 0, md: 8 }} pt={{ base: 6, md: 0 }}>
                <Text
                  fontSize="sm"
                  fontWeight="semibold"
                  color="gray.500"
                  mb="2"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  {t('pages.product.price.min', { days: histWindowSize })}
                </Text>
                <Flex align="baseline" gap="3">
                  <Heading size="xl">
                    {formatPrice(product.min_price, product.currency)}
                  </Heading>
                  {priceChange !== null && (
                    <Flex
                      align="center"
                      gap={1}
                      color={trendColor}
                      fontWeight="bold"
                      bg={`${trendColor.split('.')[0]}.100`}
                      _dark={{ bg: `${trendColor.split('.')[0]}.900` }}
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
                  <Text fontSize="sm" color="gray.500" mt={1}>
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
                  color="gray.500"
                  mb="2"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  Average Price
                </Text>
                <Heading
                  size="xl"
                  color="gray.600"
                  _dark={{ color: 'gray.300' }}
                >
                  {averagePrice
                    ? formatPrice(averagePrice, product.currency)
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
              color="gray.500"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {t('pages.product.description')}
            </Heading>
            <Text
              color="gray.700"
              _dark={{ color: 'gray.300' }}
              lineHeight="relaxed"
              fontSize="md"
            >
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
                          stopColor="#3182CE"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3182CE"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                      _dark={{ stroke: '#2D3748' }}
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#718096', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#718096', fontSize: 12 }}
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
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
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
                        stroke="#ED8936"
                        strokeDasharray="5 5"
                        strokeWidth={1.5}
                        label={{
                          value: t('pages.product.priceHistory.avgReference', {
                            value: averagePrice.toFixed(2),
                            currency: getCurrencySymbol(product.currency)
                          }),
                          position: 'insideTopRight',
                          fill: '#ED8936',
                          fontSize: 12,
                          fontWeight: 500
                        }}
                      />
                    )}

                    {/* Min price date line */}
                    {minPriceDate && (
                      <ReferenceLine
                        x={minPriceDate}
                        stroke="#48BB78"
                        strokeWidth={1.5}
                        label={{
                          value: t('pages.product.priceHistory.minReference'),
                          position: 'insideTopLeft',
                          fill: '#48BB78',
                          fontSize: 12,
                          fontWeight: 500
                        }}
                      />
                    )}

                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#3182CE"
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
              <Text color="gray.500" textAlign="center" py="8">
                {t('pages.product.priceHistory.empty')}
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      </VStack>
    </Box>
  );
};

export default ProductPage;
