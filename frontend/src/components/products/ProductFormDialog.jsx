import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Flex,
  HStack,
  Input,
  Popover,
  Skeleton,
  Spinner,
  Text,
  Textarea,
  VStack,
  createListCollection
} from '@chakra-ui/react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
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
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValueText
} from '@/components/ui/select';
import {
  ComboboxRoot,
  ComboboxControl,
  ComboboxContent,
  ComboboxItem,
  ComboboxInput,
  ComboboxEmpty
} from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toaster } from '@/components/ui/toaster';
import { FadeIn } from '@/components/motion';
import { ErrorState, CategoryColorPicker } from '@/components/common';
import { LuSparkles, LuPlus } from 'react-icons/lu';
import { products as productsApi } from '@/lib/api';
import { useProductsStore } from '@/stores/productsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { CURRENCY_CODES, getCurrencySymbol } from '@/lib/web_utils';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/categoryColors';
import { PRIORITY_ICONS, PRIORITY_FONT_WEIGHTS } from '@/lib/priorityVisuals';

/** Sentinel value for the category select's "New category" option. */
const NEW_CATEGORY_VALUE = '__new_category__';

/** Static currency options: code + symbol, built once from `CURRENCY_CODES`. */
const CURRENCY_ITEMS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: `${code} · ${getCurrencySymbol(code)}`
}));

/** Whether `value` parses as an absolute `http(s)` URL. */
function isValidProductUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Add/edit product dialog (spec Task 11). A single component handles both
 * flows:
 * - `mode="create"`: URL first, with automatic (debounced) and manual
 *   extraction via `products.extractInfo`; the rest of the fields fade in
 *   once an extraction has been attempted (or the user tries to submit
 *   without one).
 * - `mode="edit"`: no extraction. If `product` already carries every field
 *   the form needs (e.g. a full detail record) or one is already cached in
 *   `productsStore`'s `details[id]`, it is used directly; otherwise the
 *   full product is loaded on open (`productsStore.fetchDetail`) and a
 *   skeleton is shown meanwhile.
 *
 * Owns its own submission: it calls the products store, shows the success
 * and error toasts, and closes itself. This keeps wiring it from a page
 * (Task 12) to just `open` / `onClose` / `mode` / `product`.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'create'|'edit'} props.mode
 * @param {object|null} [props.product] - Required for `mode="edit"`. Either
 *   a full product record or a lighter one (e.g. a dashboard summary row);
 *   the dialog fetches the rest when needed.
 */
export const ProductFormDialog = ({ open, onClose, mode, product }) => {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const categories = useCategoriesStore((state) => state.items);
  const fetchCategories = useCategoriesStore((state) => state.fetch);
  const createCategory = useCategoriesStore((state) => state.create);

  const createProduct = useProductsStore((state) => state.create);
  const updateProduct = useProductsStore((state) => state.update);
  const fetchDetail = useProductsStore((state) => state.fetchDetail);
  const detailEntry = useProductsStore((state) =>
    product ? state.details[product.id] : undefined
  );

  // Field state.
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [currency, setCurrency] = useState('EUR');

  // Validation / submission state.
  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extraction state (create mode only).
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasAttemptedExtraction, setHasAttemptedExtraction] = useState(false);
  const [extractionError, setExtractionError] = useState(null);
  const [lastExtractedUrl, setLastExtractedUrl] = useState('');
  const extractionAbortRef = useRef(null);

  // Currency combobox filter text.
  const [currencyQuery, setCurrencyQuery] = useState('');

  // "New category" popover state.
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(
    DEFAULT_CATEGORY_COLOR
  );
  const [newCategoryError, setNewCategoryError] = useState(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  useEffect(() => () => extractionAbortRef.current?.abort(), []);

  const hasFullProductData =
    mode === 'edit' && product && typeof product.description === 'string';

  // An already-successful `details[id]` cache entry is treated the same as
  // `hasFullProductData`: this dialog only edits metadata fields (name,
  // url, description, category, priority, currency), none of which the
  // price-tracking cron job ever touches, so a cached record can't be
  // stale in a way that matters here. Skipping the refetch when one is
  // already cached (rather than always refetching) avoids a form ->
  // skeleton -> form flash, and the bug that came with it: `fetchDetail`
  // blanks `details[id]` to `{status: 'loading', data: null}` while
  // in flight, and the render-time sync below is keyed only by product id
  // (`edit:<id>`), so a second, silent resync once the fresh data arrived
  // never happened - the form kept showing the stale values it had synced
  // from before the refetch even started.
  const hasCachedDetail =
    mode === 'edit' && !hasFullProductData && detailEntry?.status === 'success';

  // Load the full product when editing from a lighter record (e.g. the
  // dashboard summary, which has no `description`) and nothing usable is
  // already cached for it.
  useEffect(() => {
    if (!open || mode !== 'edit' || !product) return;
    if (hasFullProductData || hasCachedDetail) return;
    fetchDetail(product.id);
  }, [open, mode, product, hasFullProductData, hasCachedDetail, fetchDetail]);

  const sourceProduct = hasFullProductData
    ? product
    : (detailEntry?.data ?? null);
  const isLoadingSource =
    mode === 'edit' &&
    !hasFullProductData &&
    !hasCachedDetail &&
    (!detailEntry ||
      detailEntry.status === 'loading' ||
      detailEntry.status === 'idle');
  const sourceLoadFailed =
    mode === 'edit' && !hasFullProductData && detailEntry?.status === 'error';

  // Reset/populate the form whenever the dialog opens, switches product or
  // fully closes. Done during render (instead of in an effect) to avoid an
  // extra render pass, mirroring `SettingsPage`/`CategoryModal`:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const syncKey = !open
    ? 'closed'
    : mode === 'create'
      ? 'create'
      : sourceProduct
        ? `edit:${sourceProduct.id}`
        : null;
  const [syncedKey, setSyncedKey] = useState(null);

  // Whatever extraction was in flight belonged to the form that is about
  // to be reset for the new `syncKey` below (a close, a reopen, or a
  // switch to a different product): abort it so its result can never land
  // in the form that replaces it. A ref must not be read/written during
  // render, so this is a plain effect kept in lockstep with the
  // render-time sync via the same `syncKey` dependency, rather than being
  // inlined into the `if` block below.
  useEffect(() => {
    extractionAbortRef.current?.abort();
    extractionAbortRef.current = null;
  }, [syncKey]);

  if (syncKey && syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setErrors({});
    setSubmitAttempted(false);
    setIsExtracting(false);
    setHasAttemptedExtraction(false);
    setExtractionError(null);
    setLastExtractedUrl('');
    setCurrencyQuery('');
    setNewCategoryOpen(false);
    setNewCategoryError(null);
    if (mode === 'create') {
      setUrl('');
      setName('');
      setDescription('');
      setCategoryId('');
      setPriority('Medium');
      setCurrency('EUR');
    } else if (sourceProduct) {
      setUrl(sourceProduct.url ?? '');
      setName(sourceProduct.name ?? '');
      setDescription(sourceProduct.description ?? '');
      setCategoryId(
        sourceProduct.category_id != null
          ? String(sourceProduct.category_id)
          : ''
      );
      setPriority(sourceProduct.priority ?? 'Medium');
      setCurrency(sourceProduct.currency ?? 'EUR');
    }
  }

  // Same icon + font-weight visuals as `PriorityBadge`, reused (not
  // duplicated) via its exported maps, per the brief's "SegmentedControl
  // using PriorityBadge visuals".
  const priorityOptions = useMemo(
    () =>
      [
        { key: 'high', value: 'High', text: t('common.priority.high') },
        { key: 'medium', value: 'Medium', text: t('common.priority.medium') },
        { key: 'low', value: 'Low', text: t('common.priority.low') }
      ].map(({ key, value, text }) => {
        const Icon = PRIORITY_ICONS[key];
        return {
          value,
          label: (
            <HStack gap={1}>
              <Icon size={14} aria-hidden="true" />
              <Text fontWeight={PRIORITY_FONT_WEIGHTS[key]}>{text}</Text>
            </HStack>
          )
        };
      }),
    [t]
  );

  const categoryItems = useMemo(
    () => [
      ...categories.map((cat) => ({ value: String(cat.id), label: cat.name })),
      {
        value: NEW_CATEGORY_VALUE,
        label: t('components.productFormDialog.fields.category.newOption')
      }
    ],
    [categories, t]
  );
  const categoryCollection = useMemo(
    () => createListCollection({ items: categoryItems }),
    [categoryItems]
  );

  const filteredCurrencyItems = useMemo(() => {
    const query = currencyQuery.trim().toUpperCase();
    if (!query) return CURRENCY_ITEMS;
    return CURRENCY_ITEMS.filter((item) => item.value.includes(query));
  }, [currencyQuery]);
  const currencyCollection = useMemo(
    () => createListCollection({ items: filteredCurrencyItems }),
    [filteredCurrencyItems]
  );

  // Extraction is attempted (successfully or not) or the user tried to
  // submit without one: either way, the rest of the fields become visible.
  const fieldsRevealed =
    mode === 'edit' || hasAttemptedExtraction || submitAttempted;

  const runExtraction = useCallback(
    async (trimmedUrl) => {
      // Abort any extraction already in flight before starting a new one
      // (manual "Generate"/"Retry" click racing the debounce, or two
      // debounce-triggered runs in a row), so only the latest run's result
      // is ever applied.
      extractionAbortRef.current?.abort();

      setHasAttemptedExtraction(true);
      setIsExtracting(true);
      setExtractionError(null);
      setLastExtractedUrl(trimmedUrl);

      const controller = new AbortController();
      extractionAbortRef.current = controller;

      try {
        const data = await productsApi.extractInfo(
          trimmedUrl,
          controller.signal
        );
        if (controller.signal.aborted) return;

        setName(data.name ?? '');
        setDescription(data.description ?? '');

        const extractedCategoryName = (data.category ?? '')
          .trim()
          .toLowerCase();
        const matched = useCategoriesStore
          .getState()
          .items.find(
            (cat) => cat.name.trim().toLowerCase() === extractedCategoryName
          );
        setCategoryId(matched ? String(matched.id) : '');

        const extractedCurrency = (data.currency ?? '').trim().toUpperCase();
        setCurrency(
          /^[A-Z]{3}$/.test(extractedCurrency) ? extractedCurrency : ''
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Error extracting product info:', err);
        setExtractionError(t('components.productFormDialog.errors.extraction'));
      } finally {
        if (!controller.signal.aborted) setIsExtracting(false);
      }
    },
    [t]
  );

  // Debounced auto-extraction: fires ~500ms after a valid, not-yet-tried URL
  // settles (create mode only).
  useEffect(() => {
    if (mode !== 'create' || !open || isExtracting) return;
    const trimmed = url.trim();
    if (!isValidProductUrl(trimmed) || trimmed === lastExtractedUrl) return;

    const timer = setTimeout(() => {
      runExtraction(trimmed);
    }, 500);
    return () => clearTimeout(timer);
  }, [url, mode, open, isExtracting, lastExtractedUrl, runExtraction]);

  const clearFieldError = (field) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      nextErrors.url = t('components.productFormDialog.errors.urlRequired');
    } else if (!isValidProductUrl(trimmedUrl)) {
      nextErrors.url = t('components.productFormDialog.errors.urlInvalid');
    }
    if (!name.trim()) {
      nextErrors.name = t('components.productFormDialog.errors.nameRequired');
    }
    if (!categoryId) {
      nextErrors.category = t(
        'components.productFormDialog.errors.categoryRequired'
      );
    }
    if (!/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) {
      nextErrors.currency = t(
        'components.productFormDialog.errors.currencyInvalid'
      );
    }
    return nextErrors;
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    const payload = {
      name: name.trim(),
      url: url.trim(),
      priority,
      category_id: Number(categoryId),
      description: description.trim(),
      currency: currency.trim().toUpperCase()
    };

    try {
      if (mode === 'create') {
        const created = await createProduct(payload);
        toaster.create({
          title: t('toasts.products.createSuccess.title'),
          description: t('toasts.products.createSuccess.description', {
            name: created?.name ?? payload.name
          }),
          type: 'success',
          action: created
            ? {
                label: t('pages.dashboard.menu.open'),
                onClick: () => navigate(`/product/${created.id}`)
              }
            : undefined
        });
      } else {
        // `updateProduct` (the store's `update`) also refreshes this
        // product's cached detail record itself, silently, so the product
        // page (Task 12) does not keep showing stale data after this edit.
        const updated = await updateProduct(product.id, payload);
        toaster.create({
          title: t('toasts.products.updateSuccess.title'),
          description: t('toasts.products.updateSuccess.description', {
            name: updated?.name ?? payload.name
          }),
          type: 'success'
        });
      }
      onClose();
    } catch (err) {
      console.error(
        mode === 'create'
          ? 'Error creating product:'
          : 'Error updating product:',
        err
      );
      toaster.create({
        title: t(
          mode === 'create'
            ? 'toasts.products.createError.title'
            : 'toasts.products.updateError.title'
        ),
        description: t(
          mode === 'create'
            ? 'toasts.products.createError.description'
            : 'toasts.products.updateError.description'
        ),
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openNewCategoryPopover = () => {
    setNewCategoryName('');
    setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
    setNewCategoryError(null);
    setNewCategoryOpen(true);
  };

  const handleCategoryValueChange = (details) => {
    const value = details.value[0];
    if (value === NEW_CATEGORY_VALUE) {
      openNewCategoryPopover();
      return;
    }
    setCategoryId(value ?? '');
    clearFieldError('category');
  };

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      setNewCategoryError(
        t('components.productFormDialog.newCategory.nameRequired')
      );
      return;
    }
    setIsCreatingCategory(true);
    setNewCategoryError(null);
    try {
      const created = await createCategory({
        name: trimmedName,
        color: newCategoryColor
      });
      setCategoryId(String(created.id));
      clearFieldError('category');
      setNewCategoryOpen(false);
    } catch (err) {
      console.error('Error creating category:', err);
      setNewCategoryError(t('toasts.categories.createError.description'));
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const trimmedUrl = url.trim();
  const canExtract =
    isValidProductUrl(trimmedUrl) && !isExtracting && !isSubmitting;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      size={{ base: 'full', sm: 'lg' }}
      scrollBehavior="inside"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? t('components.productFormDialog.titleCreate')
              : t('components.productFormDialog.titleEdit')}
          </DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          {sourceLoadFailed ? (
            <ErrorState
              title={t('components.productFormDialog.loadError.title')}
              message={t('components.productFormDialog.loadError.message')}
              onRetry={() => fetchDetail(product.id)}
            />
          ) : isLoadingSource ? (
            <VStack gap={4} align="stretch">
              <Skeleton height="10" borderRadius="md" />
              <Skeleton height="10" borderRadius="md" />
              <Skeleton height="20" borderRadius="md" />
              <Skeleton height="10" borderRadius="md" />
              <Skeleton height="10" borderRadius="md" />
              <Skeleton height="10" borderRadius="md" />
            </VStack>
          ) : (
            <VStack gap={4} align="stretch">
              <Field
                label={t('components.productFormDialog.fields.url.label')}
                helperText={
                  mode === 'create'
                    ? t('components.productFormDialog.fields.url.helper')
                    : undefined
                }
                errorText={errors.url}
                invalid={Boolean(errors.url)}
                required
              >
                <Input
                  placeholder={t('common.placeholders.productUrl')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </Field>

              {mode === 'create' && extractionError && (
                <Text fontSize="sm" color="fg.error">
                  {extractionError}
                </Text>
              )}

              <Field
                label={t('components.productFormDialog.fields.priority')}
                required
              >
                <SegmentedControl
                  items={priorityOptions}
                  value={priority}
                  onValueChange={(e) => setPriority(e.value)}
                  disabled={isSubmitting}
                  size="md"
                />
              </Field>

              {mode === 'create' && (
                <Button
                  variant="outline"
                  onClick={() => runExtraction(trimmedUrl)}
                  disabled={!canExtract}
                  width="full"
                >
                  {isExtracting ? (
                    <Flex align="center" gap={2}>
                      <Spinner size="sm" />
                      <Text>{t('common.actions.generating')}</Text>
                    </Flex>
                  ) : (
                    <Flex align="center" gap={2}>
                      <LuSparkles size={16} aria-hidden="true" />
                      <Text>
                        {hasAttemptedExtraction
                          ? t('common.actions.retry')
                          : t('common.actions.generateDetails')}
                      </Text>
                    </Flex>
                  )}
                </Button>
              )}

              {fieldsRevealed && (
                <FadeIn>
                  <VStack gap={4} align="stretch">
                    {isExtracting ? (
                      <>
                        <Skeleton height="10" borderRadius="md" />
                        <Skeleton height="20" borderRadius="md" />
                        <Skeleton height="10" borderRadius="md" />
                        <Skeleton height="10" borderRadius="md" />
                      </>
                    ) : (
                      <>
                        <Field
                          label={t('components.productFormDialog.fields.name')}
                          errorText={errors.name}
                          invalid={Boolean(errors.name)}
                          required
                        >
                          <Input
                            value={name}
                            onChange={(e) => {
                              setName(e.target.value);
                              clearFieldError('name');
                            }}
                            disabled={isSubmitting}
                            autoComplete="off"
                          />
                        </Field>

                        <Field
                          label={t(
                            'components.productFormDialog.fields.description'
                          )}
                        >
                          <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={isSubmitting}
                            rows={3}
                          />
                        </Field>

                        <Field
                          label={t(
                            'components.productFormDialog.fields.category.label'
                          )}
                          errorText={errors.category}
                          invalid={Boolean(errors.category)}
                          required
                        >
                          <Popover.Root
                            open={newCategoryOpen}
                            onOpenChange={(e) => setNewCategoryOpen(e.open)}
                            positioning={{ placement: 'bottom-start' }}
                          >
                            <Popover.Anchor>
                              <SelectRoot
                                collection={categoryCollection}
                                value={[categoryId]}
                                onValueChange={handleCategoryValueChange}
                                disabled={isSubmitting}
                              >
                                <SelectTrigger>
                                  <SelectValueText
                                    placeholder={t(
                                      'components.productFormDialog.fields.category.placeholder'
                                    )}
                                  />
                                </SelectTrigger>
                                <SelectContent portalled={false}>
                                  {categoryCollection.items.map((item) => (
                                    <SelectItem key={item.value} item={item}>
                                      {item.value === NEW_CATEGORY_VALUE ? (
                                        <HStack gap={2}>
                                          <LuPlus
                                            size={14}
                                            aria-hidden="true"
                                          />
                                          <Text>{item.label}</Text>
                                        </HStack>
                                      ) : (
                                        item.label
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </SelectRoot>
                            </Popover.Anchor>
                            <Popover.Positioner>
                              <Popover.Content w="280px">
                                <Popover.Body>
                                  <VStack gap={3} align="stretch">
                                    <Field
                                      label={t(
                                        'components.productFormDialog.newCategory.nameLabel'
                                      )}
                                      errorText={newCategoryError}
                                      invalid={Boolean(newCategoryError)}
                                      required
                                    >
                                      <Input
                                        value={newCategoryName}
                                        onChange={(e) =>
                                          setNewCategoryName(e.target.value)
                                        }
                                        placeholder={t(
                                          'components.productFormDialog.newCategory.namePlaceholder'
                                        )}
                                        disabled={isCreatingCategory}
                                        autoComplete="off"
                                      />
                                    </Field>
                                    <CategoryColorPicker
                                      value={newCategoryColor}
                                      onChange={setNewCategoryColor}
                                      disabled={isCreatingCategory}
                                    />
                                    <Flex justify="flex-end" gap={2}>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          setNewCategoryOpen(false)
                                        }
                                        disabled={isCreatingCategory}
                                      >
                                        {t('common.actions.cancel')}
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={handleCreateCategory}
                                        loading={isCreatingCategory}
                                      >
                                        {t(
                                          'components.productFormDialog.newCategory.submit'
                                        )}
                                      </Button>
                                    </Flex>
                                  </VStack>
                                </Popover.Body>
                              </Popover.Content>
                            </Popover.Positioner>
                          </Popover.Root>
                        </Field>

                        <Field
                          label={t(
                            'components.productFormDialog.fields.currency.label'
                          )}
                          errorText={errors.currency}
                          invalid={Boolean(errors.currency)}
                          required
                        >
                          <ComboboxRoot
                            collection={currencyCollection}
                            value={currency ? [currency] : []}
                            onValueChange={(details) => {
                              setCurrency(details.value[0] ?? '');
                              clearFieldError('currency');
                            }}
                            onInputValueChange={(details) =>
                              setCurrencyQuery(details.inputValue)
                            }
                            disabled={isSubmitting}
                            openOnClick
                          >
                            <ComboboxControl>
                              <ComboboxInput
                                placeholder={t(
                                  'components.productFormDialog.fields.currency.placeholder'
                                )}
                              />
                            </ComboboxControl>
                            <ComboboxContent portalled={false}>
                              <ComboboxEmpty>
                                {t(
                                  'components.productFormDialog.fields.currency.empty'
                                )}
                              </ComboboxEmpty>
                              {currencyCollection.items.map((item) => (
                                <ComboboxItem key={item.value} item={item}>
                                  {item.label}
                                </ComboboxItem>
                              ))}
                            </ComboboxContent>
                          </ComboboxRoot>
                        </Field>
                      </>
                    )}
                  </VStack>
                </FadeIn>
              )}
            </VStack>
          )}
        </DialogBody>
        <DialogFooter>
          <Flex gap={2} width="full" justify="flex-end">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={isLoadingSource || sourceLoadFailed}
            >
              {mode === 'create'
                ? t('components.productFormDialog.actions.submitCreate')
                : t('components.productFormDialog.actions.submitEdit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default ProductFormDialog;
