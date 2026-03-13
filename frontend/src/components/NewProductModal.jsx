import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Button,
  Input,
  Textarea,
  Flex,
  Text,
  VStack,
  Spinner,
  Link as ChakraLink,
  createListCollection
} from '@chakra-ui/react';
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
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useColorMode } from '@/components/ui/color-mode';
import { LuSparkles } from 'react-icons/lu';
import { Trans, useTranslation } from 'react-i18next';
import { API_URL } from '@/lib/api';


const NewProductModal = ({ isOpen, onClose, onSave }) => {
  const [url, setUrl] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [categories, setCategories] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { colorMode } = useColorMode();
  const { t } = useTranslation();
  const priorityOptions = useMemo(
    () => [
      { label: t('common.priority.high'), value: 'High' },
      { label: t('common.priority.medium'), value: 'Medium' },
      { label: t('common.priority.low'), value: 'Low' }
    ],
    [t]
  );

  // Error dialog state
  const [errorDialog, setErrorDialog] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  // Create collection from categories
  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: categories.map((cat) => ({ label: cat.name, value: cat.name }))
      }),
    [categories]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/categories/`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  // Fetch categories when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen, fetchCategories]);

  const handleGenerateDetails = async () => {
    if (!url.trim()) {
      setErrorDialog({
        isOpen: true,
        title: t('components.newProductModal.errors.urlRequired.title'),
        message: t('components.newProductModal.errors.urlRequired.message')
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`${API_URL}/extract-product-info/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to extract product info');
      }

      const data = await response.json();
      setName(data.name);
      setDescription(data.description);
      setCategory(data.category);
      setCurrency(data.currency || 'EUR');
      setHasGenerated(true);
    } catch (error) {
      console.error('Error generating details:', error);
      setErrorDialog({
        isOpen: true,
        title: t('components.newProductModal.errors.generationError.title'),
        message:
          error.message ||
          t('components.newProductModal.errors.generationError.message')
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!url.trim() || !name.trim() || !category) {
      setErrorDialog({
        isOpen: true,
        title: t('components.newProductModal.errors.missingFields.title'),
        message: t('components.newProductModal.errors.missingFields.message')
      });
      return;
    }

    // Find category ID by name
    const selectedCategory = categories.find((cat) => cat.name === category);
    if (!selectedCategory) {
      setErrorDialog({
        isOpen: true,
        title: t('components.newProductModal.errors.invalidCategory.title'),
        message: t('components.newProductModal.errors.invalidCategory.message')
      });
      return;
    }

    setIsLoading(true);
    try {
      const productData = {
        name: name.trim(),
        url: url.trim(),
        priority: priority,
        category_id: selectedCategory.id,
        description: description.trim(),
        currency: currency.trim()
      };

      await onSave(productData);
      handleClose();
    } catch (error) {
      console.error('Error saving product:', error);
      setErrorDialog({
        isOpen: true,
        title: t('components.newProductModal.errors.saveError.title'),
        message: t('components.newProductModal.errors.saveError.message')
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setPriority('Medium');
    setName('');
    setDescription('');
    setCategory('');
    setCurrency('EUR');
    setHasGenerated(false);
    onClose();
  };

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(e) => !e.open && handleClose()}
      size="lg"
    >
      <DialogBackdrop />
      <DialogContent maxW="600px">
        <DialogHeader>
          <DialogTitle>{t('components.newProductModal.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack gap={4} align="stretch">
            {/* Product URL */}
            <Field
              label={t('components.newProductModal.fields.productUrl.label')}
              helperText={t(
                'components.newProductModal.fields.productUrl.helper'
              )}
              required
            >
              <Input
                placeholder={t('common.placeholders.productUrl')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isGenerating || isLoading}
              />
            </Field>

            {/* Priority */}
            <Field
              label={t('components.newProductModal.fields.priority')}
              required
            >
              <SegmentedControl
                items={priorityOptions}
                value={priority}
                onValueChange={(e) => setPriority(e.value)}
                disabled={isGenerating || isLoading}
                size="md"
              />
            </Field>

            {/* Generate Details Button */}
            <Button
              onClick={handleGenerateDetails}
              disabled={!url.trim() || isGenerating || isLoading}
              colorScheme="blue"
              width="full"
              size="lg"
            >
              {isGenerating ? (
                <Flex align="center" gap={2}>
                  <Spinner size="sm" />
                  <Text>{t('common.actions.generating')}</Text>
                </Flex>
              ) : (
                <Flex align="center" gap={2}>
                  <LuSparkles />
                  <Text>{t('common.actions.generateDetails')}</Text>
                </Flex>
              )}
            </Button>

            {/* AI Generated Details Section */}
            {hasGenerated && (
              <Box
                borderWidth="1px"
                borderRadius="md"
                borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
                p={4}
                bg={colorMode === 'light' ? 'blue.50' : 'blue.900/20'}
              >
                <Flex align="center" gap={2} mb={3}>
                  <Text fontSize="sm" fontWeight="bold" color="blue.500">
                    {t('components.newProductModal.ai.title')}
                  </Text>
                </Flex>
                <Text
                  fontSize="sm"
                  color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                  mb={3}
                >
                  {t('components.newProductModal.ai.description')}
                </Text>

                <VStack gap={3} align="stretch">
                  {/* Item Name */}
                  <Field
                    label={t('components.newProductModal.fields.itemName')}
                    required
                  >
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isLoading}
                    />
                  </Field>

                  {/* Description */}
                  <Field
                    label={t('components.newProductModal.fields.description')}
                  >
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isLoading}
                      rows={3}
                    />
                  </Field>

                  {/* Category */}
                  <Field
                    label={t(
                      'components.newProductModal.fields.category.label'
                    )}
                    required
                  >
                    <SelectRoot
                      collection={categoryCollection}
                      value={[category]}
                      onValueChange={(details) => setCategory(details.value[0])}
                      disabled={isLoading || categories.length === 0}
                      size="md"
                    >
                      <SelectTrigger>
                        <SelectValueText
                          placeholder={t(
                            'components.newProductModal.fields.category.placeholder'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent portalled={false}>
                        {categoryCollection.items.map((item) => (
                          <SelectItem key={item.value} item={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectRoot>
                  </Field>

                  {/* Currency */}
                  <Field
                    label={t(
                      'components.newProductModal.fields.currency.label'
                    )}
                    helperText={
                      <Trans
                        i18nKey="components.newProductModal.fields.currency.helper"
                        components={{
                          link: (
                            <ChakraLink
                              href="https://en.wikipedia.org/wiki/ISO_4217#List_of_ISO_4217_currency_codes"
                              target="_blank"
                              rel="noopener noreferrer"
                              color="blue.500"
                              textDecoration="underline"
                            />
                          )
                        }}
                      />
                    }
                    required
                  >
                    <Input
                      placeholder={t('common.placeholders.currencyCode')}
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value.toUpperCase().trim())
                      }
                      disabled={isLoading}
                      maxLength={3}
                    />
                  </Field>
                </VStack>
              </Box>
            )}
          </VStack>
        </DialogBody>

        <DialogFooter>
          <Flex gap={2} width="full" justify="flex-end">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isGenerating || isLoading}
            >
              {t('common.actions.cancel')}
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSave}
              disabled={!hasGenerated || isGenerating || isLoading}
            >
              {isLoading
                ? t('common.actions.saving')
                : t('common.actions.saveItem')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>

      {/* Error Dialog */}
      <DialogRoot
        open={errorDialog.isOpen}
        onOpenChange={(e) => setErrorDialog({ ...errorDialog, isOpen: e.open })}
        size="sm"
        placement="center"
      >
        <DialogBackdrop />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{errorDialog.title}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text>{errorDialog.message}</Text>
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => setErrorDialog({ ...errorDialog, isOpen: false })}
              colorScheme="blue"
            >
              {t('common.actions.ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </DialogRoot>
  );
};

export default NewProductModal;
