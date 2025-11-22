import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Input,
  Text,
  VStack,
  Flex,
  createListCollection,
  HStack,
  Stack,
  Link
} from '@chakra-ui/react';
import {
  LuSave,
  LuTrendingDown,
  LuPackage,
  LuDownload,
  LuSend
} from 'react-icons/lu';
import { useColorMode } from '@/components/ui/color-mode';
import { toaster } from '@/components/ui/toaster';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Field } from '@/components/ui/field';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger
} from '@/components/ui/dialog';
import { Trans, useTranslation } from 'react-i18next';
import { persistLanguagePreference, SUPPORTED_LANGUAGES } from '@/i18n';

const API_URL = 'http://localhost:8000';

const hourCollection = createListCollection({
  items: Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, '0')}:00`,
    value: i.toString()
  }))
});

const histWindowSizeValues = [30, 60, 90, 180];

const SettingsPage = () => {
  const { colorMode } = useColorMode();
  const { t, i18n } = useTranslation();
  const linkColor = colorMode === 'light' ? 'blue.600' : 'blue.300';
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Configuration states
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [analysisHour, setAnalysisHour] = useState(12);
  const [histWindowSize, setHistWindowSize] = useState(60);
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [telegramBotString, setTelegramBotString] = useState('');
  const [telegramBotChatId, setTelegramBotChatId] = useState('');
  const [isPriceDropAlert, setIsPriceDropAlert] = useState(false);
  const [isStockChangeAlert, setIsStockChangeAlert] = useState(false);

  // Original values to track changes
  const [originalConfig, setOriginalConfig] = useState({});

  // UI states for Telegram functionality
  const [isGettingChatId, setIsGettingChatId] = useState(false);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [showStartBotModal, setShowStartBotModal] = useState(false);

  const languageCollection = useMemo(
    () =>
      createListCollection({
        items: SUPPORTED_LANGUAGES.map((language) => ({
          label: t(`common.language.${language}`),
          value: language
        }))
      }),
    [t]
  );

  const histWindowSizeOptions = useMemo(
    () =>
      histWindowSizeValues.map((value) => ({
        label: t('pages.settings.histWindowOption', { days: value }),
        value: value.toString()
      })),
    [t]
  );

  const applyLanguagePreference = useCallback(
    (language, shouldPersist = false) => {
      if (!language) return;
      i18n.changeLanguage(language);
      if (shouldPersist) {
        persistLanguagePreference(language);
      }
    },
    [i18n]
  );

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/config/`);
      if (!response.ok) throw new Error('Failed to fetch configuration');

      const data = await response.json();

      // Set all values
      setSelectedLanguage(data.selected_language);
      setAnalysisHour(data.analysys_hour);
      setHistWindowSize(data.hist_window_size);
      setGoogleApiKey(data.google_api_key || '');
      setTelegramBotString(data.telegram_bot_token || '');
      setTelegramBotChatId(data.telegram_bot_chat_id || '');
      setIsPriceDropAlert(data.is_price_drop_alert);
      setIsStockChangeAlert(data.is_stock_change_alert);

      // Store original values
      setOriginalConfig(data);
      applyLanguagePreference(data.selected_language, true);
    } catch (error) {
      console.error('Error fetching configuration:', error);
      toaster.create({
        title: t('toasts.settings.loadError.title'),
        description: t('toasts.settings.loadError.description'),
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Check if there are changes
  useEffect(() => {
    if (!originalConfig.selected_language) return; // Wait for original config to load

    const changed =
      selectedLanguage !== originalConfig.selected_language ||
      analysisHour !== originalConfig.analysys_hour ||
      histWindowSize !== originalConfig.hist_window_size ||
      googleApiKey !== (originalConfig.google_api_key || '') ||
      telegramBotString !== (originalConfig.telegram_bot_token || '') ||
      isPriceDropAlert !== originalConfig.is_price_drop_alert ||
      isStockChangeAlert !== originalConfig.is_stock_change_alert;

    setHasChanges(changed);
  }, [
    selectedLanguage,
    analysisHour,
    histWindowSize,
    googleApiKey,
    telegramBotString,
    isPriceDropAlert,
    isStockChangeAlert,
    originalConfig
  ]);

  // Get Telegram Chat ID
  const handleGetChatId = async () => {
    setIsGettingChatId(true);
    try {
      const response = await fetch(`${API_URL}/telegram-chat-id`);

      if (response.status === 400) {
        toaster.create({
          title: t('toasts.settings.botTokenMissing.title'),
          description: t('toasts.settings.botTokenMissing.description'),
          type: 'error'
        });
        return;
      }

      if (response.status === 404) {
        setShowStartBotModal(true);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to get chat ID');
      }

      // Refresh config to get the saved chat_id
      await fetchConfig();

      toaster.create({
        title: t('toasts.settings.chatIdSaved.title'),
        description: t('toasts.settings.chatIdSaved.description'),
        type: 'success'
      });
    } catch (error) {
      console.error('Error getting chat ID:', error);
      toaster.create({
        title: t('toasts.settings.chatIdError.title'),
        description:
          error.message || t('toasts.settings.chatIdError.description'),
        type: 'error'
      });
    } finally {
      setIsGettingChatId(false);
    }
  };

  // Send test message
  const handleSendTestMessage = async () => {
    setIsSendingTestMessage(true);
    try {
      const response = await fetch(`${API_URL}/telegram-test-message`, {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to send test message');
      }

      toaster.create({
        title: t('toasts.settings.testMessageSuccess.title'),
        description: t('toasts.settings.testMessageSuccess.description'),
        type: 'success'
      });
    } catch (error) {
      console.error('Error sending test message:', error);
      toaster.create({
        title: t('toasts.settings.testMessageError.title'),
        description:
          error.message || t('toasts.settings.testMessageError.description'),
        type: 'error'
      });
    } finally {
      setIsSendingTestMessage(false);
    }
  };

  // Save configuration
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/config/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_language: selectedLanguage,
          analysys_hour: analysisHour,
          hist_window_size: histWindowSize,
          google_api_key: googleApiKey || null,
          telegram_bot_token: telegramBotString || null,
          is_price_drop_alert: isPriceDropAlert,
          is_stock_change_alert: isStockChangeAlert
        })
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      const data = await response.json();
      setOriginalConfig(data);
      setHasChanges(false);
      applyLanguagePreference(data.selected_language, true);

      toaster.create({
        title: t('toasts.settings.saveSuccess.title'),
        description: t('toasts.settings.saveSuccess.description'),
        type: 'success'
      });
    } catch (error) {
      console.error('Error saving configuration:', error);
      toaster.create({
        title: t('toasts.settings.saveError.title'),
        description: t('toasts.settings.saveError.description'),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxW="container.xl" py={8}>
        <Text>{t('pages.settings.loading')}</Text>
      </Container>
    );
  }

  return (
    <Container maxW="container.lg" py={8}>
      <VStack gap={8} align="stretch">
        {/* Header */}
        <Box>
          <Heading size="2xl" mb={2}>
            {t('pages.settings.title')}
          </Heading>
          <Text color={colorMode === 'light' ? 'gray.600' : 'gray.400'}>
            {t('pages.settings.subtitle')}
          </Text>
        </Box>

        {/* General Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.900'}
        >
          <Heading size="lg" mb={4}>
            {t('pages.settings.sections.general')}
          </Heading>

          <Field label={t('pages.settings.fields.language')} mb={4}>
            <SelectRoot
              collection={languageCollection}
              value={[selectedLanguage]}
              onValueChange={(details) => {
                const nextLanguage = details.value[0];
                if (!nextLanguage) return;
                setSelectedLanguage(nextLanguage);
                applyLanguagePreference(nextLanguage);
              }}
              size="md"
            >
              <SelectTrigger>
                <SelectValueText
                  placeholder={t('common.placeholders.selectLanguage')}
                />
              </SelectTrigger>
              <SelectContent>
                {languageCollection.items.map((item) => (
                  <SelectItem key={item.value} item={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>

          <Field
            label={t('pages.settings.fields.googleApiKey.label')}
            helperText={
              <Trans
                i18nKey="pages.settings.fields.googleApiKey.helper"
                components={{
                  link: (
                    <Link
                      href="https://aistudio.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      isExternal
                      color={linkColor}
                      textDecoration="underline"
                    />
                  )
                }}
              />
            }
          >
            <Input
              value={googleApiKey}
              onChange={(e) => setGoogleApiKey(e.target.value)}
              placeholder={t('common.placeholders.googleApiKey')}
              type="password"
            />
          </Field>
        </Box>

        {/* Analysis Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.900'}
        >
          <Heading size="lg" mb={4}>
            {t('pages.settings.sections.analysis')}
          </Heading>

          <Field
            label={t('pages.settings.fields.analysisHour.label')}
            helperText={t('pages.settings.fields.analysisHour.helper')}
          >
            <SelectRoot
              collection={hourCollection}
              value={[analysisHour.toString()]}
              onValueChange={(details) =>
                setAnalysisHour(parseInt(details.value[0]))
              }
              size="md"
            >
              <SelectTrigger>
                <SelectValueText
                  placeholder={t('common.placeholders.selectHour')}
                />
              </SelectTrigger>
              <SelectContent>
                {hourCollection.items.map((item) => (
                  <SelectItem key={item.value} item={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>

          <Field
            label={t('pages.settings.fields.historicalWindow.label')}
            helperText={t('pages.settings.fields.historicalWindow.helper')}
            mt={4}
          >
            <SegmentedControl
              items={histWindowSizeOptions}
              value={histWindowSize.toString()}
              onValueChange={(e) => setHistWindowSize(parseInt(e.value, 10))}
              size="md"
            />
          </Field>
        </Box>

        {/* Notifications Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.900'}
        >
          <Heading size="lg" mb={4}>
            {t('pages.settings.sections.notifications')}
          </Heading>

          <VStack gap={6} align="stretch">
            <Stack
              gap={4}
              align="flex-start"
              direction={{ base: 'column', md: 'row' }}
            >
              <Field
                label={t('pages.settings.fields.telegramBotToken.label')}
                helperText={t('pages.settings.fields.telegramBotToken.helper')}
                flex={1}
              >
                <HStack gap={2}>
                  <Input
                    value={telegramBotString}
                    onChange={(e) => setTelegramBotString(e.target.value)}
                    placeholder={t('common.placeholders.telegramBotToken')}
                    flex={1}
                  />
                  {telegramBotString && (
                    <Button
                      onClick={handleGetChatId}
                      loading={isGettingChatId}
                      disabled={isGettingChatId}
                      size="md"
                    >
                      <LuDownload /> {t('common.actions.getChatId')}
                    </Button>
                  )}
                </HStack>
              </Field>

              {telegramBotChatId && (
                <Field
                  label={t('pages.settings.fields.telegramChatId.label')}
                  helperText={t('pages.settings.fields.telegramChatId.helper')}
                  flex={1}
                >
                  <HStack gap={2}>
                    <Input value={telegramBotChatId} disabled flex={1} />
                    <Button
                      onClick={handleSendTestMessage}
                      loading={isSendingTestMessage}
                      disabled={isSendingTestMessage}
                      size="md"
                      colorScheme="blue"
                    >
                      <LuSend /> {t('common.actions.testBot')}
                    </Button>
                  </HStack>
                </Field>
              )}
            </Stack>

            {/* Price Drop Alerts */}
            <Flex
              align="center"
              justify="space-between"
              p={4}
              borderRadius="md"
              _hover={{
                bg: colorMode === 'light' ? 'gray.50' : 'gray.800'
              }}
              transition="all 0.2s"
              opacity={!telegramBotString ? 0.5 : 1}
            >
              <Flex align="center" gap={4} flex={1}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={colorMode === 'light' ? 'blue.50' : 'blue.900'}
                  color={colorMode === 'light' ? 'blue.600' : 'blue.300'}
                >
                  <LuTrendingDown size={20} />
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t('pages.settings.alerts.priceDrop.title')}
                  </Text>
                  <Text
                    fontSize="sm"
                    color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                  >
                    {telegramBotString
                      ? t('pages.settings.alerts.priceDrop.subtitleConfigured')
                      : t('pages.settings.alerts.priceDrop.subtitleMissing')}
                  </Text>
                </Box>
              </Flex>
              <Switch
                size="lg"
                checked={isPriceDropAlert}
                onCheckedChange={(e) => setIsPriceDropAlert(e.checked)}
                disabled={!telegramBotString}
              />
            </Flex>

            {/* Stock Change Alerts */}
            <Flex
              align="center"
              justify="space-between"
              p={4}
              borderRadius="md"
              _hover={{
                bg: colorMode === 'light' ? 'gray.50' : 'gray.800'
              }}
              transition="all 0.2s"
              opacity={!telegramBotString ? 0.5 : 1}
            >
              <Flex align="center" gap={4} flex={1}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={colorMode === 'light' ? 'green.50' : 'green.900'}
                  color={colorMode === 'light' ? 'green.600' : 'green.300'}
                >
                  <LuPackage size={20} />
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t('pages.settings.alerts.stockChange.title')}
                  </Text>
                  <Text
                    fontSize="sm"
                    color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                  >
                    {telegramBotString
                      ? t(
                          'pages.settings.alerts.stockChange.subtitleConfigured'
                        )
                      : t('pages.settings.alerts.stockChange.subtitleMissing')}
                  </Text>
                </Box>
              </Flex>
              <Switch
                size="lg"
                checked={isStockChangeAlert}
                onCheckedChange={(e) => setIsStockChangeAlert(e.checked)}
                disabled={!telegramBotString}
              />
            </Flex>
          </VStack>
        </Box>

        {/* Save Button */}
        <Flex justify="flex-end">
          <Button
            size="lg"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            loading={isSaving}
          >
            <LuSave /> {t('common.actions.save')}
          </Button>
        </Flex>
      </VStack>

      {/* Start Bot Modal */}
      <DialogRoot
        open={showStartBotModal}
        onOpenChange={(e) => setShowStartBotModal(e.open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pages.settings.startBotModal.title')}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <VStack gap={4} align="stretch">
              <Text>{t('pages.settings.startBotModal.description')}</Text>
              <Box
                p={4}
                borderRadius="md"
                bg={colorMode === 'light' ? 'gray.50' : 'gray.800'}
              >
                <Text fontWeight="medium" mb={2}>
                  {t('pages.settings.startBotModal.stepsTitle')}
                </Text>
                <VStack align="stretch" gap={2}>
                  <Text>{t('pages.settings.startBotModal.steps.one')}</Text>
                  <Text>
                    <Trans
                      i18nKey="pages.settings.startBotModal.steps.two"
                      components={{ strong: <strong /> }}
                    />
                  </Text>
                  <Text>{t('pages.settings.startBotModal.steps.three')}</Text>
                </VStack>
              </Box>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setShowStartBotModal(false)}>
              {t('common.actions.gotIt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Container>
  );
};

export default SettingsPage;
