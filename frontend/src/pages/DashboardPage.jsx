import { useEffect, useMemo, useState } from 'react';
import { Button, Text } from '@chakra-ui/react';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { ProductFormDialog } from '@/components/products';
import { EmptyState, ErrorState, ConfirmDialog } from '@/components/common';
import {
  DashboardSummary,
  ProductTable,
  ProductCardList
} from '@/components/dashboard';
import { LuPackagePlus, LuPlus } from 'react-icons/lu';
import { getLocale } from '@/lib/format';
import { useTranslation, Trans } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toaster } from '@/components/ui/toaster';
import { useConfigStore } from '@/stores/configStore';
import { useProductsStore } from '@/stores/productsStore';

const DashboardPage = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  // `null` means "add" (`ProductFormDialog`'s `mode="create"`); a product
  // means "edit" that product (`mode="edit"`), set by the row/card actions
  // menu's "Edit" item (`handleEditProduct`).
  const [editingProduct, setEditingProduct] = useState(null);
  // The DOM node (the row's/card's actions-menu trigger) each dialog should
  // return focus to on close, passed as `finalFocusEl`: since it opens from
  // a `Menu.Item` (which unmounts as soon as the menu closes), the dialog's
  // own focus-trap can no longer rely on "restore focus to whatever was
  // focused" by the time it activates.
  const [editTriggerEl, setEditTriggerEl] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteTriggerEl, setDeleteTriggerEl] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { t, i18n } = useTranslation();
  const locale = useMemo(() => getLocale(i18n.language), [i18n.language]);

  useDocumentTitle(t('pages.dashboard.title'));

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetch);
  const histWindowSize = config?.hist_window_size ?? 60;

  const products = useProductsStore((state) => state.items);
  const status = useProductsStore((state) => state.status);
  const fetchSummary = useProductsStore((state) => state.fetchSummary);
  const removeProduct = useProductsStore((state) => state.remove);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setEditTriggerEl(null);
    setIsFormOpen(true);
  };

  const handleEditProduct = (product, triggerEl) => {
    setEditingProduct(product);
    setEditTriggerEl(triggerEl ?? null);
    setIsFormOpen(true);
  };

  // `editingProduct` is reset on *open* (above), not here: clearing it on
  // close would flip the dialog's title/buttons from "edit" to "add" copy
  // while it is still playing its close animation, since `mode` is derived
  // from it and the dialog stays mounted (just `open=false`) until then.
  const handleCloseForm = () => {
    setIsFormOpen(false);
  };

  const handleDeleteRequest = (product, triggerEl) => {
    setProductToDelete(product);
    setDeleteTriggerEl(triggerEl ?? null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    setIsDeleting(true);
    try {
      await removeProduct(productToDelete.id);
      toaster.create({
        title: t('toasts.products.deleteSuccess.title'),
        description: t('toasts.products.deleteSuccess.description', {
          name: productToDelete.name
        }),
        type: 'success'
      });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch {
      toaster.create({
        title: t('toasts.products.deleteError.title'),
        description: t('toasts.products.deleteError.description'),
        type: 'error'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setProductToDelete(null);
  };

  const isLoading = status === 'loading' && products.length === 0;
  // `status === 'error'` is handled by the branch above, so by the time
  // this is checked it can only mean "loaded successfully, zero products".
  const isEmpty = !isLoading && products.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title={t('pages.dashboard.title')}
        description={t('pages.dashboard.subtitle')}
        actions={
          <Button size="lg" variant="solid" onClick={handleAddProduct}>
            <LuPlus size={20} />
            {t('pages.dashboard.addButton')}
          </Button>
        }
      />
      {status === 'error' ? (
        <ErrorState
          title={t('pages.dashboard.error.title')}
          message={t('pages.dashboard.error.message')}
          onRetry={fetchSummary}
        />
      ) : isEmpty ? (
        <EmptyState
          icon={LuPackagePlus}
          title={t('pages.dashboard.table.empty.title')}
          description={t('pages.dashboard.table.empty.subtitle')}
          action={
            <Button onClick={handleAddProduct}>
              <LuPlus size={18} />
              {t('pages.dashboard.addButton')}
            </Button>
          }
        />
      ) : (
        <>
          <DashboardSummary products={products} locale={locale} />
          <ProductTable
            products={products}
            isLoading={isLoading}
            locale={locale}
            histWindowSize={histWindowSize}
            onEdit={handleEditProduct}
            onDelete={handleDeleteRequest}
          />
          <ProductCardList
            products={products}
            isLoading={isLoading}
            locale={locale}
            onEdit={handleEditProduct}
            onDelete={handleDeleteRequest}
          />
        </>
      )}

      {/* Add / edit product dialog */}
      <ProductFormDialog
        open={isFormOpen}
        onClose={handleCloseForm}
        mode={editingProduct ? 'edit' : 'create'}
        product={editingProduct}
        finalFocusEl={editTriggerEl ? () => editTriggerEl : undefined}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        finalFocusEl={deleteTriggerEl ? () => deleteTriggerEl : undefined}
        title={t('components.deleteProductDialog.title')}
        body={
          <>
            <Text>
              <Trans
                i18nKey="components.deleteProductDialog.description"
                values={{ name: productToDelete?.name }}
                components={{ strong: <strong /> }}
              />
            </Text>
            <Text mt={2}>{t('components.deleteProductDialog.warning')}</Text>
          </>
        }
        confirmLabel={t('common.actions.delete')}
        destructive
        isLoading={isDeleting}
      />
    </PageContainer>
  );
};

export default DashboardPage;
