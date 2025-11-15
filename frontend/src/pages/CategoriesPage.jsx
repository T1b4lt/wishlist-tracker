import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  IconButton,
  Text,
  VStack
} from '@chakra-ui/react';
import { LuPlus, LuPencil, LuTrash2 } from 'react-icons/lu';
import { useColorMode } from '@/components/ui/color-mode';
import CategoryModal from '../components/CategoryModal';
import { toaster } from '@/components/ui/toaster';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogBackdrop,
  DialogCloseTrigger
} from '@/components/ui/dialog';

const API_URL = 'http://localhost:8000';

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Category Create/Edit Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  // Delete Confirmation Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  const { colorMode } = useColorMode();

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_URL}/categories/`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toaster.create({
        title: 'Error loading categories',
        description: 'Failed to load categories. Please try again.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Create category
  const handleCreateCategory = async (categoryData) => {
    try {
      const response = await fetch(`${API_URL}/categories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
      });

      if (!response.ok) throw new Error('Failed to create category');

      toaster.create({
        title: 'Category created',
        description: `${categoryData.name} has been created successfully.`,
        type: 'success'
      });

      fetchCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      toaster.create({
        title: 'Error creating category',
        description: 'Failed to create category. Please try again.',
        type: 'error'
      });
      throw error;
    }
  };

  // Update category
  const handleUpdateCategory = async (categoryData) => {
    try {
      const response = await fetch(
        `${API_URL}/categories/${editingCategory.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categoryData)
        }
      );

      if (!response.ok) throw new Error('Failed to update category');

      toaster.create({
        title: 'Category updated',
        description: `${categoryData.name} has been updated successfully.`,
        type: 'success'
      });

      fetchCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      toaster.create({
        title: 'Error updating category',
        description: 'Failed to update category. Please try again.',
        type: 'error'
      });
      throw error;
    }
  };

  // Delete category - handles the actual deletion
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;

    try {
      const response = await fetch(
        `${API_URL}/categories/${categoryToDelete.id}`,
        {
          method: 'DELETE'
        }
      );

      if (response.status === 400) {
        toaster.create({
          title: 'Cannot delete category',
          description:
            'This category has associated products. Please remove or reassign them first.',
          type: 'error',
          duration: 5000
        });
        setIsDeleteModalOpen(false);
        setCategoryToDelete(null);
        return;
      }

      if (!response.ok) throw new Error('Failed to delete category');

      toaster.create({
        title: 'Category deleted',
        description: `${categoryToDelete.name} has been deleted successfully.`,
        type: 'success'
      });

      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toaster.create({
        title: 'Error deleting category',
        description: 'Failed to delete category. Please try again.',
        type: 'error'
      });
    } finally {
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
    }
  };

  // Open delete confirmation modal
  const handleOpenDeleteModal = (category) => {
    setCategoryToDelete(category);
    setIsDeleteModalOpen(true);
  };

  // Close delete confirmation modal
  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCategoryToDelete(null);
  };

  // Open category create modal
  const handleOpenCreateModal = () => {
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  };

  // Open category edit modal
  const handleOpenEditModal = (category) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };

  // Close category create/edit modal
  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
  };

  const handleSaveCategory = async (categoryData) => {
    if (editingCategory) {
      await handleUpdateCategory(categoryData);
    } else {
      await handleCreateCategory(categoryData);
    }
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack gap={8} align="stretch">
        {/* Header */}
        <Box>
          <Heading size="2xl" mb={2}>
            Manage Categories
          </Heading>
          <Text color={colorMode === 'light' ? 'gray.600' : 'gray.400'}>
            Organize your wishlist items into custom categories.
          </Text>
        </Box>

        {/* Add New Category Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.800'}
        >
          <Flex justify="space-between" align="center">
            <Box>
              <Heading size="lg">Add New Category</Heading>
            </Box>
            <Button
              colorPalette="blue"
              size="lg"
              onClick={handleOpenCreateModal}
            >
              <LuPlus /> Add Category
            </Button>
          </Flex>
        </Box>

        {/* Existing Categories */}
        <Box>
          <Heading size="lg" mb={4}>
            Existing Categories
          </Heading>

          {isLoading ? (
            <Text>Loading categories...</Text>
          ) : categories.length === 0 ? (
            <Box
              p={8}
              textAlign="center"
              borderRadius="lg"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor={colorMode === 'light' ? 'gray.300' : 'gray.600'}
            >
              <Text color={colorMode === 'light' ? 'gray.500' : 'gray.400'}>
                No categories yet. Create your first category to get started!
              </Text>
            </Box>
          ) : (
            <Grid
              templateColumns="repeat(auto-fill, minmax(300px, 1fr))"
              gap={4}
            >
              {categories.map((category) => (
                <Box
                  key={category.id}
                  p={5}
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
                  bg={colorMode === 'light' ? 'white' : 'gray.800'}
                  _hover={{
                    borderColor: colorMode === 'light' ? 'gray.300' : 'gray.600'
                  }}
                  transition="all 0.2s"
                >
                  <Flex justify="space-between" align="center">
                    <Flex align="center" gap={3} flex={1}>
                      <Box
                        w="12px"
                        h="12px"
                        borderRadius="full"
                        bg={category.color}
                        flexShrink={0}
                      />
                      <Text fontWeight="bold" fontSize="lg">
                        {category.name}
                      </Text>
                    </Flex>
                    <Flex gap={2}>
                      <IconButton
                        aria-label="Edit category"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(category)}
                      >
                        <LuPencil />
                      </IconButton>
                      <IconButton
                        aria-label="Delete category"
                        variant="ghost"
                        colorPalette="red"
                        size="sm"
                        onClick={() => handleOpenDeleteModal(category)}
                      >
                        <LuTrash2 />
                      </IconButton>
                    </Flex>
                  </Flex>
                </Box>
              ))}
            </Grid>
          )}
        </Box>
      </VStack>

      {/* Category Create/Edit Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={handleCloseCategoryModal}
        onSave={handleSaveCategory}
        category={editingCategory}
      />

      {/* Delete Confirmation Modal */}
      <DialogRoot
        open={isDeleteModalOpen}
        onOpenChange={(e) => !e.open && handleCloseDeleteModal()}
      >
        <DialogBackdrop />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text>
              Are you sure you want to delete{' '}
              <Text as="span" fontWeight="bold">
                "{categoryToDelete?.name}"
              </Text>
              ? This action cannot be undone.
            </Text>
          </DialogBody>
          <DialogFooter>
            <Flex gap={3}>
              <Button variant="outline" onClick={handleCloseDeleteModal}>
                Cancel
              </Button>
              <Button colorPalette="red" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </Flex>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Container>
  );
};

export default CategoriesPage;
