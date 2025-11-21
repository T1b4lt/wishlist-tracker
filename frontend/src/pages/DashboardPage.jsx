import { useState, useEffect } from 'react';
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
import { LuTrash2 } from 'react-icons/lu';
import { getCurrencySymbol } from '@/lib/web_utils';

const API_URL = 'http://localhost:8000';

const DashboardPage = () => {
  const [products, setProducts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [histWindowSize, setHistWindowSize] = useState(60);
  const { colorMode } = useColorMode();

  useEffect(() => {
    fetchConfig();
    fetchProducts();
  }, []);

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

  const fetchProducts = async () => {
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
  };

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
    const symbol = getCurrencySymbol(currency);
    return `${price.toFixed(2)} ${symbol}`;
  };

  const formatPriceChange = (priceChange) => {
    if (priceChange === null || priceChange === undefined) return '-';

    const sign = priceChange >= 0 ? '+' : '';
    const color = priceChange >= 0 ? 'red.500' : 'green.500';

    return (
      <Text color={color} fontWeight="medium">
        {sign}
        {priceChange.toFixed(1)}%
      </Text>
    );
  };

  return (
    <Box maxW="1400px" mx="auto" p={6}>
      <VStack gap={8} align="stretch">
        {/* Add New Product Section */}
        <Card.Root bg={colorMode === 'light' ? 'white' : 'gray.800'} p={6}>
          <Flex justify="space-between" align="center">
            <Box>
              <Heading size="lg" mb={2}>
                Add New Product
              </Heading>
              <Text color={colorMode === 'light' ? 'gray.600' : 'gray.400'}>
                Track prices and availability of products you want to buy
              </Text>
            </Box>
            <Button size="lg" onClick={() => setIsModalOpen(true)}>
              + Add New Product
            </Button>
          </Flex>
        </Card.Root>

        {/* Products List Section */}
        <Box>
          <Heading size="lg" mb={4}>
            Your Wishlist
          </Heading>

          {isLoading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="xl" />
            </Flex>
          ) : products.length === 0 ? (
            <Card.Root bg={colorMode === 'light' ? 'white' : 'gray.800'} p={8}>
              <VStack gap={3}>
                <Text
                  fontSize="lg"
                  color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                >
                  No products in your wishlist yet
                </Text>
                <Text
                  fontSize="sm"
                  color={colorMode === 'light' ? 'gray.500' : 'gray.500'}
                >
                  Click "Add New Product" to start tracking your first item
                </Text>
              </VStack>
            </Card.Root>
          ) : (
            <Card.Root bg={colorMode === 'light' ? 'white' : 'gray.800'} p={0}>
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Product Name</Table.ColumnHeader>
                    <Table.ColumnHeader>Category</Table.ColumnHeader>
                    <Table.ColumnHeader>Priority</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="end">
                      Current Price
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="end">
                      Price Change ({histWindowSize}D)
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center">
                      Stock
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center">
                      Actions
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {products.map((product) => (
                    <Table.Row key={product.id}>
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
                          size="sm"
                          style={{ backgroundColor: product.category_color }}
                        >
                          {product.category_name}
                        </Tag>
                      </Table.Cell>
                      <Table.Cell>
                        <Tag
                          size="sm"
                          colorPalette={getPriorityColor(product.priority)}
                        >
                          {product.priority.charAt(0).toUpperCase() +
                            product.priority.slice(1)}
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
                      </Table.Cell>
                      <Table.Cell textAlign="center">
                        <IconButton
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          onClick={() => handleDeleteClick(product)}
                          aria-label="Delete product"
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
