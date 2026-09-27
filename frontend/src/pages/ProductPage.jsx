import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import {
  Box,
  Button,
  Card,
  Flex,
  HStack,
  Icon,
  IconButton,
  Menu,
  Portal,
  Skeleton,
  Text,
  VisuallyHidden,
  VStack
} from '@chakra-ui/react';
import { useTranslation, Trans } from 'react-i18next';
import {
  LuEllipsis,
  LuExternalLink,
  LuMerge,
  LuPencil,
  LuPlus,
  LuTrash2
} from 'react-icons/lu';
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
  AddOfferDialog,
  EditOfferDialog,
  MergeProductDialog,
  OfferList,
  PriceHistoryChart,
  ProductDescription,
  ProductStatsRow,
  StaleProductNotice
} from '@/components/product';
import { toaster } from '@/components/ui/toaster';
import { getLocale } from '@/lib/format';
import {
  computeLowestAcrossOffers,
  computeProductOfferStats,
  selectBestOffer
} from '@/lib/bestOffer';
import { staleOffers } from '@/lib/staleness';
import { buildOfferSeries, seriesYDomain } from '@/lib/offerChart';
import {
  computeRangeStats,
  filterPriceHistoryByRange,
  getCurrentRecord,
  getTrackingStartTimestamp,
  hasEnoughHistory as hasEnoughHistoryPoints,
  resolveDefaultRange
} from '@/lib/productHistory';
import { DEFAULT_HIST_WINDOW } from '@/lib/histWindow';
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
  const histWindowSize = config?.hist_window_size ?? DEFAULT_HIST_WINDOW;

  const detail = useProductsStore((state) => state.details[productId]);
  const fetchDetail = useProductsStore((state) => state.fetchDetail);
  const removeProduct = useProductsStore((state) => state.remove);
  const unlinkOffer = useProductsStore((state) => state.unlinkOffer);
  const removeOffer = useProductsStore((state) => state.removeOffer);

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
  // Same for the store rows' menus (edit URL / remove store dialogs).
  const offerMenuTriggerRef = useRef(null);
  const [editingOffer, setEditingOffer] = useState(null);
  const [removingOffer, setRemovingOffer] = useState(null);
  const [isRemovingOffer, setIsRemovingOffer] = useState(false);
  const [isAddOfferOpen, setIsAddOfferOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  // The range selector defaults to the configured `hist_window_size`
  // (or the default window when it is not an offered option) until the user picks one
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

  // The product is valued by its best offer (see `lib/bestOffer.js`): the
  // stats row and the chart's average use its history; "lowest in range"
  // looks at every store.
  const offers = useMemo(() => product?.offers ?? [], [product]);
  const bestOfferId = useMemo(() => selectBestOffer(offers), [offers]);
  const bestOffer =
    offers.find((offer) => offer.id === bestOfferId) ?? offers[0] ?? null;
  const productStock = useMemo(
    () => computeProductOfferStats(offers, range).isInStock,
    [offers, range]
  );
  const isMultiStore = offers.length > 1;
  const storeNameOf = (offerId) =>
    offers.find((offer) => offer.id === offerId)?.store_name ?? null;
  const rawHistory = useMemo(() => bestOffer?.price_history ?? [], [bestOffer]);
  const filteredHistory = useMemo(
    () => filterPriceHistoryByRange(rawHistory, range),
    [rawHistory, range]
  );
  // One line per store; the chart plots when any store has 2+ points in
  // the range. The total history decides which message replaces it: "not
  // enough data in this range" when a longer range would plot, "tracking
  // started" otherwise.
  const series = useMemo(
    () => buildOfferSeries(offers, range),
    [offers, range]
  );
  const yDomain = useMemo(() => seriesYDomain(series), [series]);
  const hasEnoughHistory = series.some((s) => hasEnoughHistoryPoints(s.points));
  const hasEnoughTotalHistory = offers.some((offer) =>
    hasEnoughHistoryPoints(offer.price_history)
  );
  const currentRecord = useMemo(
    () => getCurrentRecord(rawHistory),
    [rawHistory]
  );
  const { average, currentVsAverage } = useMemo(
    () => computeRangeStats(filteredHistory, currentRecord),
    [filteredHistory, currentRecord]
  );
  const lowest = useMemo(
    () => computeLowestAcrossOffers(offers, range),
    [offers, range]
  );
  const trackingStartDate = useMemo(() => {
    const starts = offers
      .map((offer) => getTrackingStartTimestamp(offer.price_history))
      .filter((value) => value !== null);
    return starts.length === 0 ? null : Math.min(...starts);
  }, [offers]);

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

  const handleUnlink = async (offer) => {
    try {
      const created = await unlinkOffer(product.id, offer.id);
      toaster.create({
        title: t('toasts.offers.unlinkSuccess', { store: offer.store_name }),
        type: 'success',
        action: {
          label: t('toasts.offers.unlinkAction'),
          onClick: () => navigate(`/product/${created.id}`)
        }
      });
    } catch {
      toaster.create({ title: t('toasts.offers.error'), type: 'error' });
    }
  };

  const handleRemoveOfferConfirm = async () => {
    setIsRemovingOffer(true);
    try {
      await removeOffer(product.id, removingOffer.id);
      toaster.create({
        title: t('toasts.offers.removeSuccess', {
          store: removingOffer.store_name
        }),
        type: 'success'
      });
      setRemovingOffer(null);
    } catch {
      toaster.create({ title: t('toasts.offers.error'), type: 'error' });
    } finally {
      setIsRemovingOffer(false);
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
            {bestOffer && (
              <Button variant="outline" asChild>
                <a
                  href={bestOffer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon as={LuExternalLink} />
                  {bestOffer.store_name
                    ? t('pages.product.actions.openInStore', {
                        store: bestOffer.store_name
                      })
                    : t('pages.product.actions.openStorePage')}
                </a>
              </Button>
            )}
            <Button onClick={() => setIsFormOpen(true)}>
              <Icon as={LuPencil} />
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
                  <Icon as={LuEllipsis} />
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.Item
                      value="merge"
                      onSelect={() => setIsMergeOpen(true)}
                    >
                      <HStack gap={2}>
                        <Icon as={LuMerge} size="md" />
                        {t('pages.product.actions.merge')}
                      </HStack>
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item
                      value="delete"
                      onSelect={() => setDeleteDialogOpen(true)}
                    >
                      <HStack gap={2}>
                        <Icon as={LuTrash2} size="md" />
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
            <StockStatus inStock={productStock} />
          </HStack>

          {staleOffers(product).map((offer) => (
            <StaleProductNotice
              key={offer.id}
              lastCheckedAt={offer.last_checked_at}
              url={offer.url}
              storeName={isMultiStore ? offer.store_name : undefined}
              locale={locale}
            />
          ))}

          <ProductStatsRow
            currentPrice={bestOffer?.current_price ?? null}
            currency={product.currency}
            locale={locale}
            lowest={lowest}
            average={average}
            currentVsAverage={currentVsAverage}
            currentStoreName={
              isMultiStore ? (bestOffer?.store_name ?? undefined) : undefined
            }
            lowestStoreName={
              isMultiStore && lowest
                ? (storeNameOf(lowest.offerId) ?? undefined)
                : undefined
            }
          />
        </VStack>
      </FadeIn>

      <Box mb={6}>
        <OfferList
          offers={offers}
          currency={product.currency}
          bestOfferId={bestOfferId}
          locale={locale}
          onEdit={(offer, triggerEl) => {
            offerMenuTriggerRef.current = triggerEl;
            setEditingOffer(offer);
          }}
          onUnlink={handleUnlink}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAddOfferOpen(true)}
            >
              <Icon as={LuPlus} />
              {t('pages.product.offers.addStore')}
            </Button>
          }
          onRemove={(offer, triggerEl) => {
            offerMenuTriggerRef.current = triggerEl;
            setRemovingOffer(offer);
          }}
        />
      </Box>

      <VStack align="stretch" gap={6}>
        <PriceHistoryChart
          range={range}
          onRangeChange={handleRangeChange}
          series={series}
          yDomain={yDomain}
          average={average}
          lowest={lowest}
          hasEnoughHistory={hasEnoughHistory}
          hasEnoughTotalHistory={hasEnoughTotalHistory}
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

      <MergeProductDialog
        open={isMergeOpen}
        onClose={() => setIsMergeOpen(false)}
        product={product}
        finalFocusEl={() => deleteMenuTriggerRef.current}
      />

      <AddOfferDialog
        open={isAddOfferOpen}
        onClose={() => setIsAddOfferOpen(false)}
        product={product}
      />

      <EditOfferDialog
        open={editingOffer !== null}
        onClose={() => setEditingOffer(null)}
        productId={product.id}
        offer={editingOffer}
        finalFocusEl={() => offerMenuTriggerRef.current}
      />

      <ConfirmDialog
        open={removingOffer !== null}
        onClose={() => setRemovingOffer(null)}
        onConfirm={handleRemoveOfferConfirm}
        finalFocusEl={() => offerMenuTriggerRef.current}
        title={t('components.removeOfferDialog.title')}
        body={
          <Text>
            <Trans
              i18nKey="components.removeOfferDialog.description"
              values={{ store: removingOffer?.store_name ?? '' }}
              components={{ strong: <strong /> }}
            />
          </Text>
        }
        confirmLabel={t('pages.product.offers.remove')}
        destructive
        isLoading={isRemovingOffer}
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
