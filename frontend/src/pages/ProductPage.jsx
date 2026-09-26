import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import {
  Box,
  Button,
  Card,
  Flex,
  HStack,
  IconButton,
  Menu,
  Portal,
  Skeleton,
  Text,
  VisuallyHidden,
  VStack
} from '@chakra-ui/react';
import { useTranslation, Trans } from 'react-i18next';
import { LuEllipsis, LuExternalLink, LuPencil, LuTrash2 } from 'react-icons/lu';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FadeIn } from '@/components/motion';
import {
  CategoryTag,
  ConfirmDialog,
  ErrorState,
  PriorityBadge,
  StockStatus
} from '@/components/common';
import { ProductFormDialog } from '@/components/products';
import {
  PriceHistoryChart,
  ProductDescription,
  ProductStatsRow
} from '@/components/product';
import { toaster } from '@/components/ui/toaster';
import { formatRelative, getLocale } from '@/lib/format';
import {
  buildChartPoints,
  computeOutOfStockBands,
  computeRangeStats,
  computeYDomain,
  filterPriceHistoryByRange,
  getTrackingStartTimestamp,
  hasEnoughHistory as hasEnoughHistoryPoints,
  resolveDefaultRange
} from '@/lib/productHistory';
import { useConfigStore } from '@/stores/configStore';
import { useProductsStore } from '@/stores/productsStore';

const ProductPage = () => {
  const params = useParams();
  const productId = params.productId;
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const locale = useMemo(() => getLocale(i18n.language), [i18n.language]);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetch);
  const histWindowSize = config?.hist_window_size ?? 60;

  const detail = useProductsStore((state) => state.details[productId]);
  const fetchDetail = useProductsStore((state) => state.fetchDetail);
  const removeProduct = useProductsStore((state) => state.remove);

  const status = detail?.status ?? 'idle';
  const product = detail?.data ?? null;
  // `fetchDetail` keeps a previously-loaded record while re-fetching (see
  // `productsStore`), so the skeleton is shown only when there is truly
  // nothing to render yet, not on every background refresh.
  const showSkeleton = !product && (status === 'loading' || status === 'idle');
  const isNotFound = status === 'error' && detail?.error?.status === 404;
  const isOtherError = status === 'error' && !isNotFound && !product;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // The overflow menu's own trigger unmounts its `Menu.Item`s (including
  // "Delete") as soon as the menu closes, so the confirm dialog's
  // focus-trap can no longer fall back to "whatever was focused before it
  // opened" - it needs this ref as an explicit `finalFocusEl`.
  const deleteMenuTriggerRef = useRef(null);

  // The range selector defaults to the configured `hist_window_size`
  // (rounded to the nearest offered option) until the user picks one
  // themselves; that choice is reset whenever `productId` changes (a fresh
  // page for a different product starts from the default again).
  const [range, setRange] = useState(() => resolveDefaultRange(histWindowSize));
  const userChangedRangeRef = useRef(false);

  useDocumentTitle(
    product?.name ??
      (showSkeleton
        ? t('common.messages.loading')
        : isNotFound
          ? t('pages.product.notFound.title')
          : t('pages.product.loadError.title'))
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchDetail(productId);
  }, [fetchDetail, productId]);

  useEffect(() => {
    userChangedRangeRef.current = false;
  }, [productId]);

  useEffect(() => {
    if (!userChangedRangeRef.current) {
      setRange(resolveDefaultRange(histWindowSize));
    }
  }, [histWindowSize, productId]);

  const handleRangeChange = (value) => {
    userChangedRangeRef.current = true;
    setRange(value);
  };

  const rawHistory = useMemo(() => product?.price_history ?? [], [product]);
  const filteredHistory = useMemo(
    () => filterPriceHistoryByRange(rawHistory, range),
    [rawHistory, range]
  );
  const chartPoints = useMemo(
    () => buildChartPoints(filteredHistory),
    [filteredHistory]
  );
  // Gated on the *filtered* points (what the chart would actually plot),
  // not the product's total lifetime history: a narrow range with too few
  // points in it gets the same "not enough data" message as a genuinely new
  // product, instead of an empty/broken-looking chart.
  const hasEnoughHistory = hasEnoughHistoryPoints(chartPoints);
  const yDomain = useMemo(
    () => computeYDomain(filteredHistory),
    [filteredHistory]
  );
  const outOfStockBands = useMemo(
    () => computeOutOfStockBands(filteredHistory),
    [filteredHistory]
  );
  const { lowest, average, currentVsAverage } = useMemo(
    () => computeRangeStats(filteredHistory, product?.current_price),
    [filteredHistory, product]
  );
  const trackingStartDate = useMemo(
    () => getTrackingStartTimestamp(rawHistory),
    [rawHistory]
  );

  const handleDeleteConfirm = async () => {
    if (!product) return;
    setIsDeleting(true);
    try {
      await removeProduct(product.id);
      toaster.create({
        title: t('toasts.products.deleteSuccess.title'),
        description: t('toasts.products.deleteSuccess.description', {
          name: product.name
        }),
        type: 'success'
      });
      setDeleteDialogOpen(false);
      navigate('/');
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

  if (showSkeleton) {
    return (
      <PageContainer>
        <Box role="status" aria-live="polite">
          <VisuallyHidden>{t('common.messages.loading')}</VisuallyHidden>
          <VStack align="stretch" gap={6} aria-hidden="true">
            <Skeleton height="8" width="60%" borderRadius="md" />
            <Skeleton height="6" width="40%" borderRadius="md" />
            <Skeleton height="20" borderRadius="lg" />
            <Skeleton height="360px" borderRadius="lg" />
          </VStack>
        </Box>
      </PageContainer>
    );
  }

  if (isNotFound) {
    return (
      <PageContainer>
        <Card.Root>
          <Card.Body>
            <ErrorState
              title={t('pages.product.notFound.title')}
              message={t('pages.product.notFound.message')}
            />
            <Flex justify="center" mt={2}>
              <Link href="/" asChild>
                <Button as="a" variant="outline">
                  {t('common.actions.backToWishlist')}
                </Button>
              </Link>
            </Flex>
          </Card.Body>
        </Card.Root>
      </PageContainer>
    );
  }

  if (isOtherError || !product) {
    return (
      <PageContainer>
        <Card.Root>
          <Card.Body>
            <ErrorState
              title={t('pages.product.loadError.title')}
              message={t('pages.product.loadError.message')}
              onRetry={() => fetchDetail(productId)}
            />
            <Flex justify="center" mt={2}>
              <Link href="/" asChild>
                <Button as="a" variant="outline">
                  {t('common.actions.backToWishlist')}
                </Button>
              </Link>
            </Flex>
          </Card.Body>
        </Card.Root>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={product.name}
        titleLineClamp={2}
        backLink={{ href: '/', label: t('common.actions.backToWishlist') }}
        actions={
          <HStack gap={2} wrap="wrap" justify="flex-end">
            <Button variant="outline" asChild>
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                <LuExternalLink size={16} aria-hidden="true" />
                {t('pages.product.actions.openStorePage')}
              </a>
            </Button>
            <Button onClick={() => setIsFormOpen(true)}>
              <LuPencil size={16} aria-hidden="true" />
              {t('common.actions.edit')}
            </Button>
            <Menu.Root positioning={{ placement: 'bottom-end' }}>
              <Menu.Trigger asChild>
                <IconButton
                  ref={deleteMenuTriggerRef}
                  variant="ghost"
                  aria-label={t('pages.product.actions.moreActions', {
                    name: product.name
                  })}
                >
                  <LuEllipsis />
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.Item
                      value="delete"
                      onSelect={() => setDeleteDialogOpen(true)}
                    >
                      <HStack gap={2}>
                        <LuTrash2 size={16} aria-hidden="true" />
                        {t('common.actions.delete')}
                      </HStack>
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          </HStack>
        }
      />

      <FadeIn>
        <VStack align="stretch" gap={6} mb={6}>
          <HStack gap={3} wrap="wrap">
            <CategoryTag
              name={product.category_name}
              color={product.category_color}
            />
            <PriorityBadge priority={product.priority} />
            <StockStatus inStock={product.is_in_stock} />
            <Text textStyle="caption" color="fg.muted">
              {product.last_checked_at
                ? t('pages.product.metadata.lastChecked', {
                    time: formatRelative(product.last_checked_at, locale)
                  })
                : t('pages.product.metadata.lastCheckedUnknown')}
            </Text>
          </HStack>

          <ProductStatsRow
            currentPrice={product.current_price}
            currency={product.currency}
            locale={locale}
            lowest={lowest}
            average={average}
            currentVsAverage={currentVsAverage}
          />
        </VStack>
      </FadeIn>

      <VStack align="stretch" gap={6}>
        <PriceHistoryChart
          range={range}
          onRangeChange={handleRangeChange}
          chartPoints={chartPoints}
          yDomain={yDomain}
          outOfStockBands={outOfStockBands}
          average={average}
          lowest={lowest}
          hasEnoughHistory={hasEnoughHistory}
          trackingStartDate={trackingStartDate}
          currency={product.currency}
          locale={locale}
        />

        <ProductDescription description={product.description} />
      </VStack>

      <ProductFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        mode="edit"
        product={product}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        finalFocusEl={() => deleteMenuTriggerRef.current}
        title={t('components.deleteProductDialog.title')}
        body={
          <>
            <Text>
              <Trans
                i18nKey="components.deleteProductDialog.description"
                values={{ name: product.name }}
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

export default ProductPage;
