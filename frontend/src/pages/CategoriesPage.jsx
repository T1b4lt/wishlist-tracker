import { useState, useEffect, useCallback } from 'react';
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
import { useTranslation, Trans } from 'react-i18next';
import { API_URL } from '@/lib/api';

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Category Create/Edit Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  // Delete Confirmation Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  const { t } = useTranslation();

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/categories/`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toaster.create({
        title: t('toasts.categories.loadError.title'),
        description: t('toasts.categories.loadError.description'),
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // Fetch-on-mount: state is updated from the async request, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories();
  }, [fetchCategories]);

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
        title: t('toasts.categories.createSuccess.title'),
        description: t('toasts.categories.createSuccess.description', {
          name: categoryData.name
        }),
        type: 'success'
      });

      fetchCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      toaster.create({
        title: t('toasts.categories.createError.title'),
        description: t('toasts.categories.createError.description'),
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
        title: t('toasts.categories.updateSuccess.title'),
        description: t('toasts.categories.updateSuccess.description', {
          name: categoryData.name
        }),
        type: 'success'
      });

      fetchCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      toaster.create({
        title: t('toasts.categories.updateError.title'),
        description: t('toasts.categories.updateError.description'),
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
          title: t('toasts.categories.deleteBlocked.title'),
          description: t('toasts.categories.deleteBlocked.description'),
          type: 'error',
          duration: 5000
        });
        setIsDeleteModalOpen(false);
        setCategoryToDelete(null);
        return;
      }

      if (!response.ok) throw new Error('Failed to delete category');

      toaster.create({
        title: t('toasts.categories.deleteSuccess.title'),
        description: t('toasts.categories.deleteSuccess.description', {
          name: categoryToDelete.name
        }),
        type: 'success'
      });

      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toaster.create({
        title: t('toasts.categories.deleteError.title'),
        description: t('toasts.categories.deleteError.description'),
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
            {t('pages.categories.title')}
          </Heading>
          <Text color="fg.muted">{t('pages.categories.subtitle')}</Text>
        </Box>

        {/* Add New Category Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border"
          bg="bg.panel"
        >
          <Flex justify="space-between" align="center">
            <Box>
              <Heading size="lg">
                {t('pages.categories.addSection.title')}
              </Heading>
            </Box>
            <Button size="lg" onClick={handleOpenCreateModal}>
              <LuPlus /> {t('pages.categories.addSection.button')}
            </Button>
          </Flex>
        </Box>

        {/* Existing Categories */}
        <Box>
          <Heading size="lg" mb={4}>
            {t('pages.categories.existingSection.title')}
          </Heading>

          {isLoading ? (
            <Text>{t('pages.categories.existingSection.loading')}</Text>
          ) : categories.length === 0 ? (
            <Box
              p={8}
              textAlign="center"
              borderRadius="lg"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="border.emphasized"
            >
              <Text color="fg.muted">
                {t('pages.categories.existingSection.empty')}
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
                  borderColor="border"
                  bg="bg.panel"
                  _hover={{ borderColor: 'border.emphasized' }}
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
                        aria-label={t('pages.categories.aria.editCategory')}
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(category)}
                      >
                        <LuPencil />
                      </IconButton>
                      <IconButton
                        aria-label={t('pages.categories.aria.deleteCategory')}
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
            <DialogTitle>
              {t('pages.categories.deleteDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text>
              <Trans
                i18nKey="pages.categories.deleteDialog.message"
                values={{ name: categoryToDelete?.name }}
                components={{ strong: <strong /> }}
              />
            </Text>
          </DialogBody>
          <DialogFooter>
            <Flex gap={3}>
              <Button variant="outline" onClick={handleCloseDeleteModal}>
                {t('common.actions.cancel')}
              </Button>
              <Button colorPalette="red" onClick={handleConfirmDelete}>
                {t('common.actions.delete')}
              </Button>
            </Flex>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Container>
  );
};

export default CategoriesPage;
