import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Heading,
  VStack,
  Text,
  Flex,
  Spinner,
  Card
} from '@chakra-ui/react';
import { Link } from 'wouter';
import { useColorMode } from '@/components/ui/color-mode';
import NewProductModal from '@/components/NewProductModal';

const API_URL = 'http://localhost:8000';

const DashboardPage = () => {
  const [products, setProducts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { colorMode } = useColorMode();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/products/`);
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

  return (
    <Box maxW="1200px" mx="auto" p={6}>
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
            <Button
              colorScheme="blue"
              size="lg"
              onClick={() => setIsModalOpen(true)}
            >
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
            <VStack gap={3} align="stretch">
              {products.map((product) => (
                <Card.Root
                  key={product.id}
                  bg={colorMode === 'light' ? 'white' : 'gray.800'}
                  p={4}
                  _hover={{
                    bg: colorMode === 'light' ? 'gray.50' : 'gray.700',
                    cursor: 'pointer'
                  }}
                  transition="background 0.2s"
                >
                  <Link href={`/product/${product.id}`}>
                    <Text
                      fontSize="lg"
                      fontWeight="medium"
                      color={colorMode === 'light' ? 'gray.900' : 'gray.100'}
                    >
                      {product.name}
                    </Text>
                  </Link>
                </Card.Root>
              ))}
            </VStack>
          )}
        </Box>
      </VStack>

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
      />
    </Box>
  );
};

export default DashboardPage;
