import { useEffect, useState } from 'react';
import { Button, Text } from '@chakra-ui/react';
import { LuPlus, LuShapes } from 'react-icons/lu';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toaster } from '@/components/ui/toaster';
import { EmptyState, ErrorState, ConfirmDialog } from '@/components/common';
import {
  CategoryFormDialog,
  CategoryList,
  CategoryListSkeleton
} from '@/components/categories';
import { useTranslation, Trans } from 'react-i18next';
import { useCategoriesStore } from '@/stores/categoriesStore';

const CategoriesPage = () => {
  // Category create/edit dialog state.
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  // Delete confirmation dialog state.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { t } = useTranslation();

  useDocumentTitle(t('pages.categories.title'));

  const categories = useCategoriesStore((state) => state.items);
  const status = useCategoriesStore((state) => state.status);
  const fetchCategories = useCategoriesStore((state) => state.fetch);
  const createCategory = useCategoriesStore((state) => state.create);
  const updateCategory = useCategoriesStore((state) => state.update);
  const removeCategory = useCategoriesStore((state) => state.remove);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsFormOpen(true);
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
  };

  const handleSaveCategory = async (data) => {
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, data);
        toaster.create({
          title: t('toasts.categories.updateSuccess.title'),
          description: t('toasts.categories.updateSuccess.description', {
            name: data.name
          }),
          type: 'success'
        });
      } else {
        await createCategory(data);
        toaster.create({
          title: t('toasts.categories.createSuccess.title'),
          description: t('toasts.categories.createSuccess.description', {
            name: data.name
          }),
          type: 'success'
        });
      }
    } catch (err) {
      console.error(
        editingCategory
          ? 'Error updating category:'
          : 'Error creating category:',
        err
      );
      toaster.create({
        title: t(
          editingCategory
            ? 'toasts.categories.updateError.title'
            : 'toasts.categories.createError.title'
        ),
        description: t(
          editingCategory
            ? 'toasts.categories.updateError.description'
            : 'toasts.categories.createError.description'
        ),
        type: 'error'
      });
      throw err;
    }
  };

  const handleDeleteRequest = (category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setCategoryToDelete(null);
  };

  const handleDeleteConfirm = async () => {
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
      setDeleteDialogOpen(false);
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
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = status === 'loading' && categories.length === 0;
  // `status === 'error'` is handled by the branch above, so by the time
  // this is checked it can only mean "loaded successfully, zero categories".
  const isEmpty = !isLoading && status !== 'error' && categories.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title={t('pages.categories.title')}
        description={t('pages.categories.subtitle')}
        actions={
          <Button size="lg" onClick={handleAddCategory}>
            <LuPlus size={20} /> {t('pages.categories.addButton')}
          </Button>
        }
      />

      {status === 'error' ? (
        <ErrorState
          title={t('pages.categories.error.title')}
          message={t('pages.categories.error.message')}
          onRetry={fetchCategories}
        />
      ) : isLoading ? (
        <CategoryListSkeleton count={6} />
      ) : isEmpty ? (
        <EmptyState
          icon={LuShapes}
          title={t('pages.categories.existingSection.empty')}
          action={
            <Button onClick={handleAddCategory}>
              <LuPlus size={18} /> {t('pages.categories.addButton')}
            </Button>
          }
        />
      ) : (
        <CategoryList
          categories={categories}
          onEdit={handleEditCategory}
          onDelete={handleDeleteRequest}
        />
      )}

      {/* Category create/edit dialog */}
      <CategoryFormDialog
        open={isFormOpen}
        onClose={handleCloseForm}
        onSave={handleSaveCategory}
        category={editingCategory}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
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
