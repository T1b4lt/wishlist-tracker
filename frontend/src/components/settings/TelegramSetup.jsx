import { useState } from 'react';
import { Box, Button, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { LuDownload, LuSend } from 'react-icons/lu';
import { useTranslation, Trans } from 'react-i18next';
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { toaster } from '@/components/ui/toaster';
import { telegram as telegramApi } from '@/lib/api';
import { useConfigStore } from '@/stores/configStore';
import { SecretInput } from './SecretInput';
import { TelegramStatusBadge } from './TelegramStatusBadge';

/**
 * The Telegram integration's 3-step checklist: bot token, linking the chat
 * ("Get chat id") and sending a test message. Reads the connection status
 * (`telegram_status`) and chat id live from the config store, since both
 * are set by backend actions rather than typed by the user; only the bot
 * token itself is a draft field, controlled by the parent (`SettingsPage`).
 *
 * Owns the Telegram-specific async actions (getting the chat id, sending a
 * test message) and their toasts, and refreshes the config store after
 * obtaining a chat id so `telegram_status` picks up the change. That
 * refresh reconciles into the caller's draft via `mergeUpstreamChanges`
 * (see `SettingsPage`) rather than resetting it, so it never discards
 * unrelated unsaved edits.
 *
 * @param {object} props
 * @param {string} props.tokenValue
 * @param {(value: string) => void} props.onTokenChange
 * @param {string} props.savedToken - The saved (config) token, `''` when unset.
 * @param {boolean} props.isTokenDirty - Whether `tokenValue` has unsaved edits.
 */
export const TelegramSetup = ({
  tokenValue,
  onTokenChange,
  savedToken,
  isTokenDirty
}) => {
  const { t } = useTranslation();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetch);

  const [isGettingChatId, setIsGettingChatId] = useState(false);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [showStartBotModal, setShowStartBotModal] = useState(false);

  const status = config?.telegram_status ?? 'not_configured';
  const chatId = config?.telegram_bot_chat_id ?? '';
  const canLinkChat = status !== 'not_configured' && !isTokenDirty;
  const canSendTest = status === 'connected';

  const handleGetChatId = async () => {
    setIsGettingChatId(true);
    try {
      await telegramApi.getChatId();

      // `fetchConfig` never rejects (it stores the failure in the store
      // instead), so check its status afterward to report a refresh
      // failure. `force: true` re-fetches even though the store already
      // considers the config loaded.
      await fetchConfig(true);
      if (useConfigStore.getState().status === 'error') {
        toaster.create({
          title: t('toasts.settings.chatIdError.title'),
          description: t('toasts.settings.chatIdError.description'),
          type: 'error'
        });
        return;
      }

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
      // Never render the raw (untranslated) `error.message`: always fall
      // back to a translated, generic description.
      toaster.create({
        title: t('toasts.settings.chatIdError.title'),
        description: t('toasts.settings.chatIdError.description'),
        type: 'error'
      });
    } finally {
      setIsGettingChatId(false);
    }
  };

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
        description: t('toasts.settings.testMessageError.description'),
        type: 'error'
      });
    } finally {
      setIsSendingTestMessage(false);
    }
  };

  return (
    <VStack gap={5} align="stretch">
      <HStack justify="space-between" wrap="wrap" gap={2}>
        <Text fontWeight="semibold">
          {t('pages.settings.fields.telegramBotToken.label')}
        </Text>
        <TelegramStatusBadge status={status} />
      </HStack>

      <Box>
        <Text textStyle="caption" color="fg.muted" mb={2}>
          {t('pages.settings.telegram.steps.token')}
        </Text>
        <SecretInput
          label={t('pages.settings.fields.telegramBotToken.label')}
          helperText={t('pages.settings.fields.telegramBotToken.helper')}
          value={tokenValue}
          onChange={onTokenChange}
          savedValue={savedToken}
          placeholder={t('common.placeholders.telegramBotToken')}
        />
      </Box>

      <Box>
        <Text textStyle="caption" color="fg.muted" mb={2}>
          {t('pages.settings.telegram.steps.chat')}
        </Text>
        <HStack gap={3} wrap="wrap">
          <Button
            onClick={handleGetChatId}
            loading={isGettingChatId}
            disabled={!canLinkChat || isGettingChatId}
            size="md"
          >
            <LuDownload size={16} aria-hidden="true" />
            {t('common.actions.getChatId')}
          </Button>
          {chatId && (
            <Field
              label={t('pages.settings.fields.telegramChatId.label')}
              mb={0}
            >
              <Input
                value={chatId}
                readOnly
                maxW="200px"
                bg="bg.muted"
                cursor="default"
              />
            </Field>
          )}
        </HStack>
        {!canLinkChat && (
          <Text textStyle="caption" color="fg.muted" mt={2}>
            {t('pages.settings.telegram.chatIdDisabledReason')}
          </Text>
        )}
      </Box>

      <Box>
        <Text textStyle="caption" color="fg.muted" mb={2}>
          {t('pages.settings.telegram.steps.test')}
        </Text>
        <Button
          onClick={handleSendTestMessage}
          loading={isSendingTestMessage}
          disabled={!canSendTest || isSendingTestMessage}
          size="md"
        >
          <LuSend size={16} aria-hidden="true" />
          {t('common.actions.testBot')}
        </Button>
        {!canSendTest && (
          <Text textStyle="caption" color="fg.muted" mt={2}>
            {t('pages.settings.telegram.testDisabledReason')}
          </Text>
        )}
      </Box>

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
    </VStack>
  );
};
