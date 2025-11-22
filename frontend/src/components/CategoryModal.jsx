import { useState, useEffect } from 'react';
import { Box, Button, Input, Flex, Text, Grid, VStack } from '@chakra-ui/react';
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
import { useColorMode } from '@/components/ui/color-mode';
import { useTranslation } from 'react-i18next';

const PREDEFINED_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#A855F7', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6366F1', // indigo
  '#06B6D4', // cyan
  '#94A3B8', // slate
  '#64748B' // gray
];

const CategoryModal = ({ isOpen, onClose, onSave, category = null }) => {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PREDEFINED_COLORS[0]);
  const [customColor, setCustomColor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { colorMode } = useColorMode();
  const { t } = useTranslation();

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSelectedColor(category.color);
    } else {
      setName('');
      setSelectedColor(PREDEFINED_COLORS[0]);
      setCustomColor('');
    }
  }, [category, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await onSave({
        name: name.trim(),
        color: customColor || selectedColor
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
    setSelectedColor(PREDEFINED_COLORS[0]);
    setCustomColor('');
    onClose();
  };

  const activeColor = customColor || selectedColor;

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
            <Text
              fontSize="sm"
              color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
            >
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
            <Box>
              <Text fontWeight="medium" mb={3}>
                {t('components.categoryModal.fields.color')}
              </Text>
              <Grid templateColumns="repeat(6, 1fr)" gap={3} mb={4}>
                {PREDEFINED_COLORS.map((color) => (
                  <Box
                    key={color}
                    as="button"
                    w="40px"
                    h="40px"
                    borderRadius="full"
                    bg={color}
                    cursor="pointer"
                    border={
                      activeColor === color
                        ? '3px solid'
                        : '2px solid transparent'
                    }
                    borderColor={
                      activeColor === color
                        ? colorMode === 'light'
                          ? 'gray.800'
                          : 'white'
                        : 'transparent'
                    }
                    transition="all 0.2s"
                    _hover={{
                      transform: 'scale(1.1)',
                      boxShadow: 'lg'
                    }}
                    onClick={() => {
                      setSelectedColor(color);
                      setCustomColor('');
                    }}
                  />
                ))}
              </Grid>

              {/* Custom Color Picker */}
              <Flex align="center" gap={3}>
                <Input
                  type="color"
                  value={customColor || selectedColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  w="60px"
                  h="40px"
                  p={1}
                  cursor="pointer"
                />
                <Text
                  fontSize="sm"
                  color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                >
                  {t('components.categoryModal.customColor')}
                </Text>
              </Flex>
            </Box>
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
