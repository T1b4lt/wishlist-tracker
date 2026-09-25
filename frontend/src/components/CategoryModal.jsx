import { useState } from 'react';
import { Box, Button, Input, Flex, Text, VStack } from '@chakra-ui/react';
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
import { CategoryColorPicker } from '@/components/common';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/categoryColors';
import { useTranslation } from 'react-i18next';

const CategoryModal = ({ isOpen, onClose, onSave, category = null }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  // Reset the form whenever the modal opens/closes or the edited category changes.
  // Done during render (instead of in an effect) to avoid an extra render pass:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [syncedProps, setSyncedProps] = useState(null);
  if (syncedProps?.category !== category || syncedProps?.isOpen !== isOpen) {
    setSyncedProps({ category, isOpen });
    if (category) {
      setName(category.name);
      setColor(category.color);
    } else {
      setName('');
      setColor(DEFAULT_CATEGORY_COLOR);
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await onSave({
        name: name.trim(),
        color
      });
      handleClose();
    } catch (error) {
      console.error('Error saving category:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setColor(DEFAULT_CATEGORY_COLOR);
    onClose();
  };

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && handleClose()}>
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category
              ? t('components.categoryModal.titleEdit')
              : t('components.categoryModal.titleCreate')}
          </DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack gap={6} align="stretch">
            <Text fontSize="sm" color="fg.muted">
              {category
                ? t('components.categoryModal.descriptionEdit')
                : t('components.categoryModal.descriptionCreate')}
            </Text>

            {/* Category Name */}
            <Box>
              <Text fontWeight="medium" mb={2}>
                {t('components.categoryModal.fields.name')}
              </Text>
              <Input
                placeholder={t('components.categoryModal.placeholderName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </Box>

            {/* Color Selection */}
            <CategoryColorPicker
              value={color}
              onChange={setColor}
              disabled={isLoading}
            />
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Flex gap={3}>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              {t('common.actions.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || isLoading}
              loading={isLoading}
            >
              {category
                ? t('components.categoryModal.buttons.update')
                : t('components.categoryModal.buttons.create')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default CategoryModal;
