import { useEffect, useMemo, useState } from 'react';
import { Button, Text } from '@chakra-ui/react';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import NewProductModal from '@/components/NewProductModal';
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Edit hook point for Task 11: the row/card actions menu's "Edit" item
  // calls `handleEditProduct`, which sets this. `NewProductModal` only
  // supports creating today; Task 11's shared `ProductFormDialog` will read
  // `editingProduct` to open in edit mode and clear it (via
  // `setEditingProduct(null)`) when it closes. Nothing renders from it yet,
  // so it is read here only to keep the setter meaningful without an
  // unused-variable lint error.
  const [editingProduct, setEditingProduct] = useState(null);
  void editingProduct;
  const { t, i18n } = useTranslation();
  const locale = useMemo(() => getLocale(i18n.language), [i18n.language]);

  useDocumentTitle(t('pages.dashboard.title'));

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetch);
  const histWindowSize = config?.hist_window_size ?? 60;

  const products = useProductsStore((state) => state.items);
  const status = useProductsStore((state) => state.status);
  const fetchSummary = useProductsStore((state) => state.fetchSummary);
  const createProduct = useProductsStore((state) => state.create);
  const removeProduct = useProductsStore((state) => state.remove);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleSaveProduct = async (productData) => {
    try {
      const created = await createProduct(productData);
      toaster.create({
        title: t('toasts.products.createSuccess.title'),
        description: t('toasts.products.createSuccess.description', {
          name: created?.name ?? productData.name
        }),
        type: 'success'
      });
    } catch (err) {
      toaster.create({
        title: t('toasts.products.createError.title'),
        description: t('toasts.products.createError.description'),
        type: 'error'
      });
      throw err;
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
  };

  const handleDeleteRequest = (product) => {
    setProductToDelete(product);
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
          <Button
            size="lg"
            variant="solid"
            onClick={() => setIsModalOpen(true)}
          >
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
            <Button onClick={() => setIsModalOpen(true)}>
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

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
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
