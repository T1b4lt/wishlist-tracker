import { useState } from 'react';
import { Box, Button, Flex, Input, Text, VStack } from '@chakra-ui/react';
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
import { Field } from '@/components/ui/field';
import { CategoryColorPicker, CategoryTag } from '@/components/common';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/categoryColors';
import { useTranslation } from 'react-i18next';

/**
 * Add/edit category dialog (Task 13), replacing the legacy `CategoryModal`.
 * A name field (inline-validated: required), the `CategoryColorPicker` and
 * a live `CategoryTag` preview reflecting both as they are edited.
 *
 * Owns its own submission state (a spinner on the confirm button while
 * `onSave` is pending) but not the mutation itself or its toast: the caller
 * (`CategoriesPage`) calls the store and shows the success/error toast,
 * mirroring `ProductFormDialog`/`DashboardPage`. On a rejected `onSave` the
 * dialog stays open so the user can retry.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(data: {name: string, color: string}) => Promise<unknown>} props.onSave
 * @param {object|null} [props.category] - `null` for "create"; the category
 *   being edited otherwise.
 */
export const CategoryFormDialog = ({
  open,
  onClose,
  onSave,
  category = null
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [nameError, setNameError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset/populate the form whenever the dialog opens, switches category or
  // fully closes. Done during render (instead of in an effect) to avoid an
  // extra render pass, mirroring `ProductFormDialog`:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const syncKey = !open
    ? 'closed'
    : category
      ? `edit:${category.id}`
      : 'create';
  const [syncedKey, setSyncedKey] = useState(null);

  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setNameError(null);
    setIsSubmitting(false);
    if (category) {
      setName(category.name);
      setColor(category.color);
    } else {
      setName('');
      setColor(DEFAULT_CATEGORY_COLOR);
    }
  }

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t('components.categoryFormDialog.errors.nameRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({ name: trimmedName, color });
      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const trimmedName = name.trim();

  return (
    <DialogRoot open={open} onOpenChange={(e) => !e.open && handleClose()}>
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category
              ? t('components.categoryFormDialog.titleEdit')
              : t('components.categoryFormDialog.titleCreate')}
          </DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack gap={6} align="stretch">
            <Text fontSize="sm" color="fg.muted">
              {category
                ? t('components.categoryFormDialog.descriptionEdit')
                : t('components.categoryFormDialog.descriptionCreate')}
            </Text>

            <Field
              label={t('components.categoryFormDialog.fields.name')}
              errorText={nameError}
              invalid={Boolean(nameError)}
              required
            >
              <Input
                placeholder={t('components.categoryFormDialog.placeholderName')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                disabled={isSubmitting}
                autoComplete="off"
              />
            </Field>

            <CategoryColorPicker
              value={color}
              onChange={setColor}
              disabled={isSubmitting}
            />

            <Box>
              <Text fontWeight="medium" mb={2}>
                {t('components.categoryFormDialog.fields.preview')}
              </Text>
              <CategoryTag
                name={
                  trimmedName ||
                  t('components.categoryFormDialog.previewPlaceholder')
                }
                color={color}
              />
            </Box>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Flex gap={3}>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleSave} loading={isSubmitting}>
              {category
                ? t('components.categoryFormDialog.buttons.update')
                : t('components.categoryFormDialog.buttons.create')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
