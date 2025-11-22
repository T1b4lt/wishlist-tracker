import { useState, useEffect, useMemo } from 'react';
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
import { LuArrowLeft, LuExternalLink } from 'react-icons/lu';
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
  Legend
} from 'recharts';
import { useTranslation } from 'react-i18next';

const API_URL = 'http://localhost:8000';

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

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/config/`);
      if (!response.ok) throw new Error('Failed to fetch config');
      const data = await response.json();
      setHistWindowSize(data.hist_window_size);
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const fetchProductDetail = async () => {
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
  };

  useEffect(() => {
    fetchConfig();
    fetchProductDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const formatPrice = (price, currency) => {
    if (price === null || price === undefined) {
      return t('common.messages.notAvailable');
    }
    const symbol = getCurrencySymbol(currency);
    return `${price.toFixed(2)} ${symbol}`;
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
        return 'blue';
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

        {/* Product header */}
        <Box>
          <Heading size="2xl" mb="4">
            {product.name}
          </Heading>
          <HStack gap="2" wrap="wrap">
            <Tag size="md" style={{ backgroundColor: product.category_color }}>
              {product.category_name}
            </Tag>
            <Tag size="md" colorPalette={getPriorityColor(product.priority)}>
              {getPriorityLabel(product.priority, t)}
            </Tag>
            <Tag size="md" colorPalette={product.is_in_stock ? 'green' : 'red'}>
              {product.is_in_stock
                ? t('common.status.inStock')
                : t('common.status.outOfStock')}
            </Tag>
          </HStack>
        </Box>

        {/* Description */}
        <Card.Root>
          <Card.Body>
            <Heading size="md" mb="3">
              {t('pages.product.description')}
            </Heading>
            <Text color="gray.600" lineHeight="tall">
              {product.description}
            </Text>
          </Card.Body>
        </Card.Root>

        {/* Product URL */}
        <Card.Root>
          <Card.Body>
            <Heading size="md" mb="3">
              {t('pages.product.productLink')}
            </Heading>
            <a href={product.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" colorPalette="blue">
                <LuExternalLink />
                {t('common.actions.viewOnline')}
              </Button>
            </a>
          </Card.Body>
        </Card.Root>

        {/* Price information */}
        <Stack direction={{ base: 'column', md: 'row' }} gap="4">
          <Card.Root flex="1">
            <Card.Body>
              <Text fontSize="sm" color="gray.500" mb="1">
                {t('pages.product.price.current')}
              </Text>
              <Heading size="2xl">
                {formatPrice(product.current_price, product.currency)}
              </Heading>
            </Card.Body>
          </Card.Root>

          <Card.Root flex="1">
            <Card.Body>
              <Text fontSize="sm" color="gray.500" mb="1">
                {t('pages.product.price.min', { days: histWindowSize })}
              </Text>
              <Flex direction="column" gap="1">
                <Flex align="baseline" gap="2">
                  <Heading size="2xl">
                    {formatPrice(product.min_price, product.currency)}
                  </Heading>
                  {priceChange !== null && (
                    <Text
                      fontSize="lg"
                      fontWeight="semibold"
                      color={priceChange > 0 ? 'red.500' : 'green.500'}
                    >
                      {priceChange > 0 ? '↑' : '↓'}{' '}
                      {Math.abs(priceChange).toFixed(1)}%
                    </Text>
                  )}
                </Flex>
                {getMinPriceDateLong() && (
                  <Text fontSize="xs" color="gray.500">
                    {t('pages.product.price.minReached', {
                      date: getMinPriceDateLong()
                    })}
                  </Text>
                )}
              </Flex>
            </Card.Body>
          </Card.Root>
        </Stack>

        {/* Price history chart */}
        <Card.Root>
          <Card.Body>
            <Heading size="md" mb="4">
              {t('pages.product.priceHistory.title')}
            </Heading>
            {chartData.length > 0 ? (
              <Box height="300px" width="100%">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis
                      tickFormatter={(value) =>
                        `${value.toFixed(0)} ${getCurrencySymbol(
                          product.currency
                        )}`
                      }
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
                        color: '#fff'
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="line"
                      formatter={() =>
                        t('pages.product.priceHistory.legendPrice')
                      }
                    />

                    {/* Average price line (horizontal, dashed, orange) */}
                    {averagePrice && (
                      <ReferenceLine
                        y={averagePrice}
                        stroke="#ED8936"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        label={{
                          value: t('pages.product.priceHistory.avgReference', {
                            value: averagePrice.toFixed(2),
                            currency: getCurrencySymbol(product.currency)
                          }),
                          position: 'insideTopRight',
                          fill: '#ED8936',
                          fontSize: 12
                        }}
                      />
                    )}

                    {/* Min price date line (vertical, solid, green) */}
                    {minPriceDate && (
                      <ReferenceLine
                        x={minPriceDate}
                        stroke="#48BB78"
                        strokeWidth={2}
                        label={{
                          value: t('pages.product.priceHistory.minReference'),
                          position: 'insideTopLeft',
                          fill: '#48BB78',
                          fontSize: 12
                        }}
                      />
                    )}

                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#3182CE"
                      strokeWidth={2}
                      dot={{ fill: '#3182CE', r: 4 }}
                      activeDot={{ r: 6 }}
                      name={t('pages.product.priceHistory.legendPrice')}
                    />
                  </LineChart>
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
