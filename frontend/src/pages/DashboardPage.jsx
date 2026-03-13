import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Heading,
  VStack,
  Text,
  Flex,
  Spinner,
  Card,
  Table,
  IconButton,
  Circle
} from '@chakra-ui/react';
import { Link } from 'wouter';
import { useColorMode } from '@/components/ui/color-mode';
import { Tag } from '@/components/ui/tag';
import NewProductModal from '@/components/NewProductModal';
import DeleteProductDialog from '@/components/DeleteProductDialog';
import {
  LuTrash2,
  LuPackagePlus,
  LuTrendingUp,
  LuTrendingDown,
  LuMinus,
  LuPlus
} from 'react-icons/lu';
import { getPriorityLabel } from '@/lib/web_utils';
import { useTranslation } from 'react-i18next';
import { API_URL } from '@/lib/api';

const DashboardPage = () => {
  const [products, setProducts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [histWindowSize, setHistWindowSize] = useState(60);
  const { colorMode } = useColorMode();
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

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/products/dashboard-summary`);
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchProducts();
  }, [fetchConfig, fetchProducts]);

  const handleSaveProduct = async (productData) => {
    try {
      const response = await fetch(`${API_URL}/products/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create product');
      }

      // Refresh products list
      await fetchProducts();
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  };

  const handleDeleteClick = (product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    try {
      const response = await fetch(
        `${API_URL}/products/${productToDelete.id}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete product');
      }

      // Refresh products list
      await fetchProducts();
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setProductToDelete(null);
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

  const formatPrice = (price, currency) => {
    if (price === null || price === undefined) return '-';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }).format(price);
  };

  const formatPriceChange = (priceChange) => {
    if (priceChange === null || priceChange === undefined) return '-';

    const isPositive = priceChange > 0;
    const isNegative = priceChange < 0;
    const color = isPositive
      ? 'red.500'
      : isNegative
        ? 'green.500'
        : 'gray.500';
    const Icon = isPositive
      ? LuTrendingUp
      : isNegative
        ? LuTrendingDown
        : LuMinus;

    const formattedChange = new Intl.NumberFormat(locale, {
      style: 'percent',
      signDisplay: 'never',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(Math.abs(priceChange) / 100);

    return (
      <Flex
        align="center"
        justify="flex-end"
        color={color}
        fontWeight="medium"
        gap={1}
      >
        <Icon size={14} />
        <Text>{formattedChange}</Text>
      </Flex>
    );
  };

  return (
    <Box maxW="1400px" mx="auto" p={6}>
      <VStack gap={8} align="stretch">
        {/* Add New Product Section */}
        <Box
          borderRadius="2xl"
          bgGradient={
            colorMode === 'light'
              ? 'to-r, blue.600, purple.600'
              : 'to-r, blue.900, purple.900'
          }
          color="white"
          p={{ base: 6, md: 8 }}
          shadow="lg"
        >
          <Flex
            justify="space-between"
            align="center"
            direction={{ base: 'column', md: 'row' }}
            gap={4}
          >
            <Box textAlign={{ base: 'center', md: 'left' }}>
              <Heading size="xl" mb={2} color="white">
                {t('pages.dashboard.hero.title')}
              </Heading>
              <Text color="whiteAlpha.800" fontSize="lg">
                {t('pages.dashboard.hero.subtitle')}
              </Text>
            </Box>
            <Button
              size="lg"
              variant="solid"
              onClick={() => setIsModalOpen(true)}
              shadow="md"
            >
              <LuPlus size={20} />
              {t('pages.dashboard.hero.button')}
            </Button>
          </Flex>
        </Box>

        {/* Products List Section */}
        <Box>
          <Heading size="lg" mb={4}>
            {t('pages.dashboard.table.title')}
          </Heading>

          {isLoading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="xl" />
            </Flex>
          ) : products.length === 0 ? (
            <Card.Root
              bg={colorMode === 'light' ? 'white' : 'gray.800'}
              p={12}
              variant="outline"
              borderStyle="dashed"
              borderWidth="2px"
            >
              <VStack gap={4}>
                <Circle
                  size="48px"
                  bg={colorMode === 'light' ? 'gray.100' : 'gray.700'}
                >
                  <LuPackagePlus
                    size={24}
                    color={colorMode === 'light' ? '#718096' : '#A0AEC0'}
                  />
                </Circle>
                <Text
                  fontSize="xl"
                  fontWeight="medium"
                  color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                >
                  {t('pages.dashboard.table.empty.title')}
                </Text>
                <Text
                  fontSize="sm"
                  color={colorMode === 'light' ? 'gray.500' : 'gray.500'}
                >
                  {t('pages.dashboard.table.empty.subtitle')}
                </Text>
              </VStack>
            </Card.Root>
          ) : (
            <Card.Root
              bg={colorMode === 'light' ? 'white' : 'gray.800'}
              p={0}
              overflow="hidden"
              shadow="sm"
            >
              <Table.Root size="md" variant="line">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>
                      {t('pages.dashboard.table.columns.name')}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t('pages.dashboard.table.columns.category')}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>
                      {t('pages.dashboard.table.columns.priority')}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="end">
                      {t('pages.dashboard.table.columns.currentPrice')}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="end">
                      {t('pages.dashboard.table.columns.priceChange', {
                        days: histWindowSize
                      })}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center">
                      {t('pages.dashboard.table.columns.stock')}
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center">
                      {t('pages.dashboard.table.columns.actions')}
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {products.map((product) => (
                    <Table.Row
                      key={product.id}
                      _hover={{
                        bg: colorMode === 'light' ? 'gray.50' : 'whiteAlpha.100'
                      }}
                    >
                      <Table.Cell>
                        <Link href={`/product/${product.id}`}>
                          <Text
                            fontWeight="medium"
                            color={
                              colorMode === 'light' ? 'blue.600' : 'blue.400'
                            }
                            _hover={{
                              textDecoration: 'underline',
                              cursor: 'pointer'
                            }}
                          >
                            {product.name}
                          </Text>
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <Tag
                          size="md"
                          variant="subtle"
                          style={{
                            backgroundColor:
                              colorMode === 'dark'
                                ? 'transparent'
                                : product.category_color,
                            borderColor: product.category_color,
                            borderWidth: '1px',
                            color:
                              colorMode === 'dark'
                                ? product.category_color
                                : 'white'
                          }}
                        >
                          {product.category_name}
                        </Tag>
                      </Table.Cell>
                      <Table.Cell>
                        <Tag
                          size="md"
                          variant="subtle"
                          colorPalette={getPriorityColor(product.priority)}
                        >
                          {getPriorityLabel(product.priority, t)}
                        </Tag>
                      </Table.Cell>
                      <Table.Cell textAlign="end">
                        <Text fontWeight="medium">
                          {formatPrice(product.current_price, product.currency)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell textAlign="end">
                        {formatPriceChange(product.price_change_60d)}
                      </Table.Cell>
                      <Table.Cell textAlign="center">
                        {product.is_in_stock !== null && (
                          <Circle
                            size="10px"
                            bg={product.is_in_stock ? 'green.500' : 'red.500'}
                            display="inline-block"
                          />
                        )}
                        {product.is_in_stock === null && (
                          <Text color="gray.500">-</Text>
                        )}
                        {product.is_in_stock !== null && (
                          <Text
                            fontSize="sm"
                            color="gray.500"
                            display="inline-block"
                            ml={2}
                          >
                            {product.is_in_stock
                              ? t('common.status.inStock')
                              : t('common.status.outOfStock')}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell textAlign="center">
                        <IconButton
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          onClick={() => handleDeleteClick(product)}
                          aria-label={t('pages.dashboard.aria.deleteProduct')}
                        >
                          <LuTrash2 />
                        </IconButton>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card.Root>
          )}
        </Box>
      </VStack>

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteProductDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        productName={productToDelete?.name || ''}
      />
    </Box>
  );
};

export default DashboardPage;
