import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Flex,
  Text,
  VStack,
  createListCollection
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle
} from '@/components/ui/dialog';
import {
  ComboboxContent,
  ComboboxControl,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot
} from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toaster } from '@/components/ui/toaster';
import { useProductsStore } from '@/stores/productsStore';

/**
 * Merges another product (the same item tracked in other stores) into this
 * one: pick the other product (same currency only), choose whose shared
 * fields to keep, check the preview and confirm. This product's id is kept,
 * so the page stays where it is.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ id: number, name: string, currency: string, offers: object[] }} props.product
 * @param {() => (HTMLElement|null|undefined)} [props.finalFocusEl]
 */
export const MergeProductDialog = ({
  open,
  onClose,
  product,
  finalFocusEl
}) => {
  const { t } = useTranslation();
  const items = useProductsStore((state) => state.items);
  const status = useProductsStore((state) => state.status);
  const fetchSummary = useProductsStore((state) => state.fetchSummary);
  const merge = useProductsStore((state) => state.merge);
  const [sourceId, setSourceId] = useState(null);
  const [keep, setKeep] = useState('target');
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSourceId(null);
      setKeep('target');
      setQuery('');
    }
  }

  useEffect(() => {
    if (open && status === 'idle') fetchSummary();
  }, [open, status, fetchSummary]);

  const candidates = useMemo(
    () =>
      items.filter(
        (item) => item.id !== product.id && item.currency === product.currency
      ),
    [items, product.id, product.currency]
  );
  const collection = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return createListCollection({
      items: candidates
        .filter((item) => item.name.toLowerCase().includes(needle))
        .map((item) => ({ value: String(item.id), label: item.name }))
    });
  }, [candidates, query]);
  const source = candidates.find((item) => item.id === sourceId) ?? null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await merge(product.id, { source_product_id: source.id, keep });
      toaster.create({
        title: t('toasts.products.mergeSuccess'),
        type: 'success'
      });
      onClose();
    } catch {
      toaster.create({ title: t('toasts.products.mergeError'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      finalFocusEl={finalFocusEl}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('components.mergeProductDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text color="fg.muted">
              {t('components.mergeProductDialog.description', {
                name: product.name
              })}
            </Text>
            <Field
              label={t('components.mergeProductDialog.productLabel')}
              required
            >
              <ComboboxRoot
                collection={collection}
                value={sourceId === null ? [] : [String(sourceId)]}
                onValueChange={(details) =>
                  setSourceId(
                    details.value[0] ? Number(details.value[0]) : null
                  )
                }
                onInputValueChange={(details) => setQuery(details.inputValue)}
                disabled={isSubmitting}
                openOnClick
              >
                <ComboboxControl>
                  <ComboboxInput
                    placeholder={t(
                      'components.mergeProductDialog.productPlaceholder'
                    )}
                  />
                </ComboboxControl>
                <ComboboxContent portalled={false}>
                  <ComboboxEmpty>
                    {t('components.mergeProductDialog.empty', {
                      currency: product.currency
                    })}
                  </ComboboxEmpty>
                  {collection.items.map((item) => (
                    <ComboboxItem key={item.value} item={item}>
                      {item.label}
                    </ComboboxItem>
                  ))}
                </ComboboxContent>
              </ComboboxRoot>
            </Field>
            <Field label={t('components.mergeProductDialog.keepLabel')}>
              <SegmentedControl
                items={[
                  {
                    value: 'target',
                    label: t('components.mergeProductDialog.keepTarget')
                  },
                  {
                    value: 'source',
                    label: t('components.mergeProductDialog.keepSource')
                  }
                ]}
                value={keep}
                onValueChange={(e) => setKeep(e.value)}
                disabled={isSubmitting}
              />
            </Field>
            {source && (
              <Text fontWeight="medium">
                {t('components.mergeProductDialog.preview', {
                  name: keep === 'target' ? product.name : source.name,
                  count: product.offers.length + source.offers.length
                })}
              </Text>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Flex gap={2} justify="flex-end" width="full">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!source}
            >
              {t('components.mergeProductDialog.submit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
