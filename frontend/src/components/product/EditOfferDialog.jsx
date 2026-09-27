import { useState } from 'react';
import { Button, Flex, Input } from '@chakra-ui/react';
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
import { isValidProductUrl } from '@/lib/web_utils';
import { useProductsStore } from '@/stores/productsStore';

/**
 * Small dialog to change one offer's URL (the backend re-resolves its store).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {number|string} props.productId
 * @param {{ id: number, url: string }|null} props.offer
 * @param {() => (HTMLElement|null|undefined)} [props.finalFocusEl]
 */
export const EditOfferDialog = ({
  open,
  onClose,
  productId,
  offer,
  finalFocusEl
}) => {
  const { t } = useTranslation();
  const updateOffer = useProductsStore((state) => state.updateOffer);
  const [url, setUrl] = useState(offer?.url ?? '');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncedOfferId, setSyncedOfferId] = useState(offer?.id ?? null);

  // Reset when another offer is edited (render-time sync, as in ProductFormDialog).
  if (offer && offer.id !== syncedOfferId) {
    setSyncedOfferId(offer.id);
    setUrl(offer.url);
    setError(null);
  }

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!isValidProductUrl(trimmed)) {
      setError(t('components.editOfferDialog.urlInvalid'));
      return;
    }
    setIsSubmitting(true);
    try {
      await updateOffer(productId, offer.id, { url: trimmed });
      toaster.create({
        title: t('toasts.offers.updateSuccess'),
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
      finalFocusEl={finalFocusEl}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('components.editOfferDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <Field
            label={t('components.editOfferDialog.urlLabel')}
            errorText={error}
            invalid={Boolean(error)}
            required
          >
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Flex gap={2} justify="flex-end" width="full">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} loading={isSubmitting}>
              {t('components.editOfferDialog.submit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
