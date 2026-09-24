import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  IconButton,
  Text
} from '@chakra-ui/react';
import { LuPlus, LuPencil, LuTrash2, LuShapes } from 'react-icons/lu';
import CategoryModal from '../components/CategoryModal';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toaster } from '@/components/ui/toaster';
import {
  EmptyState,
  ErrorState,
  SkeletonCards,
  ConfirmDialog
} from '@/components/common';
import { useTranslation, Trans } from 'react-i18next';
import { useCategoriesStore } from '@/stores/categoriesStore';

const CategoriesPage = () => {
  // Category Create/Edit Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  // Delete Confirmation Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { t } = useTranslation();

  useDocumentTitle(t('pages.categories.title'));

  const categories = useCategoriesStore((state) => state.items);
  const status = useCategoriesStore((state) => state.status);
  const error = useCategoriesStore((state) => state.error);
  const fetchCategories = useCategoriesStore((state) => state.fetch);
  const createCategory = useCategoriesStore((state) => state.create);
  const updateCategory = useCategoriesStore((state) => state.update);
  const removeCategory = useCategoriesStore((state) => state.remove);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Create category
  const handleCreateCategory = async (categoryData) => {
    try {
      await createCategory(categoryData);
      toaster.create({
        title: t('toasts.categories.createSuccess.title'),
        description: t('toasts.categories.createSuccess.description', {
          name: categoryData.name
        }),
        type: 'success'
      });
    } catch (err) {
      console.error('Error creating category:', err);
      toaster.create({
        title: t('toasts.categories.createError.title'),
        description: t('toasts.categories.createError.description'),
        type: 'error'
      });
      throw err;
    }
  };

  // Update category
  const handleUpdateCategory = async (categoryData) => {
    try {
      await updateCategory(editingCategory.id, categoryData);
      toaster.create({
        title: t('toasts.categories.updateSuccess.title'),
        description: t('toasts.categories.updateSuccess.description', {
          name: categoryData.name
        }),
        type: 'success'
      });
    } catch (err) {
      console.error('Error updating category:', err);
      toaster.create({
        title: t('toasts.categories.updateError.title'),
        description: t('toasts.categories.updateError.description'),
        type: 'error'
      });
      throw err;
    }
  };

  // Delete category - handles the actual deletion
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;

    setIsDeleting(true);
    try {
      await removeCategory(categoryToDelete.id);
      toaster.create({
        title: t('toasts.categories.deleteSuccess.title'),
        description: t('toasts.categories.deleteSuccess.description', {
          name: categoryToDelete.name
        }),
        type: 'success'
      });
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
    } catch (err) {
      if (err.status === 400) {
        toaster.create({
          title: t('toasts.categories.deleteBlocked.title'),
          description: t('toasts.categories.deleteBlocked.description'),
          type: 'error',
          duration: 5000
        });
      } else {
        console.error('Error deleting category:', err);
        toaster.create({
          title: t('toasts.categories.deleteError.title'),
          description: t('toasts.categories.deleteError.description'),
          type: 'error'
        });
      }
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
    } finally {
      setIsDeleting(false);
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

  const isLoading = status === 'loading' && categories.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title={t('pages.categories.title')}
        description={t('pages.categories.subtitle')}
        actions={
          <Button size="lg" onClick={handleOpenCreateModal}>
            <LuPlus /> {t('pages.categories.addButton')}
          </Button>
        }
      />
      <Box>
        <Heading size="lg" mb={4}>
          {t('pages.categories.existingSection.title')}
        </Heading>

        {status === 'error' ? (
          <ErrorState
            title={t('pages.categories.error.title')}
            message={error ?? t('pages.categories.error.message')}
            onRetry={fetchCategories}
          />
        ) : isLoading ? (
          <SkeletonCards count={6} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={LuShapes}
            title={t('pages.categories.existingSection.empty')}
          />
        ) : (
          <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={4}>
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

      {/* Category Create/Edit Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={handleCloseCategoryModal}
        onSave={handleSaveCategory}
        category={editingCategory}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title={t('pages.categories.deleteDialog.title')}
        body={
          <Text>
            <Trans
              i18nKey="pages.categories.deleteDialog.message"
              values={{ name: categoryToDelete?.name }}
              components={{ strong: <strong /> }}
            />
          </Text>
        }
        confirmLabel={t('common.actions.delete')}
        destructive
        isLoading={isDeleting}
      />
    </PageContainer>
  );
};

export default CategoriesPage;
