import { useState } from 'react';
import {
  Button,
  Flex,
  HStack,
  Input,
  Spinner,
  Text,
  VStack
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
import { Field } from '@/components/ui/field';
import { toaster } from '@/components/ui/toaster';
import { StoreBadge } from '@/components/common';
import { products as productsApi } from '@/lib/api';
import { isValidProductUrl } from '@/lib/web_utils';
import { useProductsStore } from '@/stores/productsStore';

/**
 * Adds another store (offer) to a product: paste the URL, extract the
 * store and currency with the AI, check the currency matches the product's
 * and confirm. Extraction returns no price; the first one arrives with the
 * next daily check.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ id: number, name: string, currency: string }} props.product
 */
export const AddOfferDialog = ({ open, onClose, product }) => {
  const { t } = useTranslation();
  const addOffer = useProductsStore((state) => state.addOffer);
  const [url, setUrl] = useState('');
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Start clean every time the dialog opens (render-time sync).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl('');
      setExtracted(null);
      setError(null);
    }
  }

  const trimmedUrl = url.trim();
  const currency = extracted?.currency?.trim().toUpperCase() ?? null;
  const currencyMismatch = currency !== null && currency !== product.currency;

  const handleFetch = async () => {
    setIsExtracting(true);
    setError(null);
    setExtracted(null);
    try {
      setExtracted(await productsApi.extractInfo(trimmedUrl));
    } catch {
      setError(t('components.addOfferDialog.extractionError'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await addOffer(product.id, {
        url: trimmedUrl,
        currency,
        store_id: extracted.store?.id
      });
      toaster.create({
        title: t('toasts.offers.addSuccess', {
          store: extracted.store?.name ?? ''
        }),
        type: 'success'
      });
      onClose();
    } catch (err) {
      toaster.create({
        title: t(
          err?.status === 409
            ? 'toasts.offers.duplicateUrl'
            : 'toasts.offers.error'
        ),
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('components.addOfferDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text color="fg.muted">
              {t('components.addOfferDialog.description', {
                name: product.name
              })}
            </Text>
            <Field label={t('components.addOfferDialog.urlLabel')} required>
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setExtracted(null);
                }}
                placeholder={t('common.placeholders.productUrl')}
                disabled={isExtracting || isSubmitting}
                autoComplete="off"
              />
            </Field>
            <Button
              variant="outline"
              onClick={handleFetch}
              disabled={
                !isValidProductUrl(trimmedUrl) || isExtracting || isSubmitting
              }
            >
              {isExtracting && <Spinner size="sm" />}
              {t('components.addOfferDialog.fetch')}
            </Button>
            {error && (
              <Text color="fg.error" fontSize="sm">
                {error}
              </Text>
            )}
            {extracted && (
              <VStack align="stretch" gap={2}>
                <HStack gap={2}>
                  <Text textStyle="sm" color="fg.muted">
                    {t('components.addOfferDialog.store')}
                  </Text>
                  <StoreBadge
                    storeId={extracted.store?.id}
                    name={extracted.store?.name}
                    hasFavicon={extracted.store?.has_favicon}
                    size="md"
                  />
                </HStack>
                <Text textStyle="sm">
                  {t('components.addOfferDialog.currency')}: {currency}
                </Text>
                {currencyMismatch ? (
                  <Text color="fg.error" fontSize="sm">
                    {t('components.addOfferDialog.currencyMismatch', {
                      found: currency,
                      name: product.name,
                      expected: product.currency
                    })}
                  </Text>
                ) : (
                  <Text textStyle="caption" color="fg.muted">
                    {t('components.addOfferDialog.firstPriceHint')}
                  </Text>
                )}
              </VStack>
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
              disabled={!extracted || currencyMismatch}
            >
              {t('components.addOfferDialog.submit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
