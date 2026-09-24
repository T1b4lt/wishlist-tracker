import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Heading,
  IconButton,
  Input,
  InputGroup,
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
  LuSend,
  LuEye,
  LuEyeOff
} from 'react-icons/lu';
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
import { SUPPORTED_LANGUAGES } from '@/i18n';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { telegram as telegramApi } from '@/lib/api';
import { useConfigStore } from '@/stores/configStore';
import { ErrorState, LoadingState } from '@/components/common';

const hourCollection = createListCollection({
  items: Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, '0')}:00`,
    value: i.toString()
  }))
});

const histWindowSizeValues = [30, 60, 90, 180];

const SettingsPage = () => {
  const { t } = useTranslation();
  useDocumentTitle(t('pages.settings.title'));
  const [isSaving, setIsSaving] = useState(false);

  const configStatus = useConfigStore((state) => state.status);
  const config = useConfigStore((state) => state.config);
  const configError = useConfigStore((state) => state.error);
  const fetchConfig = useConfigStore((state) => state.fetch);
  const saveConfig = useConfigStore((state) => state.save);

  // Configuration states
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [analysisHour, setAnalysisHour] = useState(12);
  const [histWindowSize, setHistWindowSize] = useState(60);
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [telegramBotString, setTelegramBotString] = useState('');
  const [telegramBotChatId, setTelegramBotChatId] = useState('');
  const [isPriceDropAlert, setIsPriceDropAlert] = useState(false);
  const [isStockChangeAlert, setIsStockChangeAlert] = useState(false);

  // UI states for Telegram functionality
  const [isGettingChatId, setIsGettingChatId] = useState(false);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [showStartBotModal, setShowStartBotModal] = useState(false);
  const [isTelegramTokenVisible, setIsTelegramTokenVisible] = useState(false);

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

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Sync the form fields from the store's config whenever it (re)loads: the
  // initial fetch, a save (the store returns the freshly-saved config), or a
  // forced refetch (e.g. after getting a Telegram chat id). Done during
  // render (instead of in an effect) to avoid an extra render pass:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [syncedConfig, setSyncedConfig] = useState(null);
  if (config && syncedConfig !== config) {
    setSyncedConfig(config);
    setSelectedLanguage(config.selected_language);
    setAnalysisHour(config.analysis_hour);
    setHistWindowSize(config.hist_window_size);
    setGoogleApiKey(config.google_api_key || '');
    setTelegramBotString(config.telegram_bot_token || '');
    setTelegramBotChatId(config.telegram_bot_chat_id || '');
    setIsPriceDropAlert(config.is_price_drop_alert);
    setIsStockChangeAlert(config.is_stock_change_alert);
  }

  // Derive whether the form differs from the last loaded/saved configuration
  const hasChanges = useMemo(() => {
    if (!config) return false; // Wait for the config to load

    return (
      selectedLanguage !== config.selected_language ||
      analysisHour !== config.analysis_hour ||
      histWindowSize !== config.hist_window_size ||
      googleApiKey !== (config.google_api_key || '') ||
      telegramBotString !== (config.telegram_bot_token || '') ||
      isPriceDropAlert !== config.is_price_drop_alert ||
      isStockChangeAlert !== config.is_stock_change_alert
    );
  }, [
    selectedLanguage,
    analysisHour,
    histWindowSize,
    googleApiKey,
    telegramBotString,
    isPriceDropAlert,
    isStockChangeAlert,
    config
  ]);

  // Get Telegram Chat ID
  const handleGetChatId = async () => {
    setIsGettingChatId(true);
    try {
      await telegramApi.getChatId();

      // Refresh config to get the saved chat_id
      await fetchConfig(true);

      toaster.create({
        title: t('toasts.settings.chatIdSaved.title'),
        description: t('toasts.settings.chatIdSaved.description'),
        type: 'success'
      });
    } catch (error) {
      if (error.status === 400) {
        toaster.create({
          title: t('toasts.settings.botTokenMissing.title'),
          description: t('toasts.settings.botTokenMissing.description'),
          type: 'error'
        });
        return;
      }

      if (error.status === 404) {
        setShowStartBotModal(true);
        return;
      }

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
      await telegramApi.sendTestMessage();

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
      await saveConfig({
        selected_language: selectedLanguage,
        analysis_hour: analysisHour,
        hist_window_size: histWindowSize,
        google_api_key: googleApiKey || null,
        telegram_bot_token: telegramBotString || null,
        is_price_drop_alert: isPriceDropAlert,
        is_stock_change_alert: isStockChangeAlert
      });

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

  if (configStatus === 'error' && !config) {
    return (
      <PageContainer>
        <ErrorState
          title={t('toasts.settings.loadError.title')}
          message={configError ?? t('toasts.settings.loadError.description')}
          onRetry={() => fetchConfig(true)}
        />
      </PageContainer>
    );
  }

  if (!config) {
    return (
      <PageContainer>
        <LoadingState label={t('pages.settings.loading')} minH="200px" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('pages.settings.title')}
        description={t('pages.settings.subtitle')}
      />
      <VStack gap={8} align="stretch">
        {/* General Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor="border"
          bg="bg.panel"
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
                // Only update the form value here. The language is applied
                // and persisted only after a successful Save (see B4).
                setSelectedLanguage(nextLanguage);
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
                      color="fg"
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
          borderColor="border"
          bg="bg.panel"
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
          borderColor="border"
          bg="bg.panel"
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
                  <InputGroup
                    flex={1}
                    endElement={
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={
                          isTelegramTokenVisible
                            ? t('pages.settings.aria.hideTelegramBotToken')
                            : t('pages.settings.aria.showTelegramBotToken')
                        }
                        onClick={() =>
                          setIsTelegramTokenVisible((visible) => !visible)
                        }
                      >
                        {isTelegramTokenVisible ? <LuEyeOff /> : <LuEye />}
                      </IconButton>
                    }
                  >
                    <Input
                      value={telegramBotString}
                      onChange={(e) => setTelegramBotString(e.target.value)}
                      placeholder={t('common.placeholders.telegramBotToken')}
                      type={isTelegramTokenVisible ? 'text' : 'password'}
                    />
                  </InputGroup>
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
              _hover={{ bg: 'bg.muted' }}
              transition="all 0.2s"
              opacity={!telegramBotString ? 0.5 : 1}
            >
              <Flex align="center" gap={4} flex={1}>
                <Box p={2} borderRadius="md" bg="bg.muted" color="price.down">
                  <LuTrendingDown size={20} />
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t('pages.settings.alerts.priceDrop.title')}
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
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
              _hover={{ bg: 'bg.muted' }}
              transition="all 0.2s"
              opacity={!telegramBotString ? 0.5 : 1}
            >
              <Flex align="center" gap={4} flex={1}>
                <Box p={2} borderRadius="md" bg="bg.muted" color="stock.in">
                  <LuPackage size={20} />
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t('pages.settings.alerts.stockChange.title')}
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
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
              <Box p={4} borderRadius="md" bg="bg.muted">
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
    </PageContainer>
  );
};

export default SettingsPage;
