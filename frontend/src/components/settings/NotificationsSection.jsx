import { Box, Flex, Icon, Text, VStack } from '@chakra-ui/react';
import { LuPackage, LuTrendingDown } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { useConfigStore } from '@/stores/configStore';
import { SettingsSection } from './SettingsSection';
import { TelegramSetup } from './TelegramSetup';

/**
 * One alert row: an icon, title, description and a switch. The switch is
 * enabled only when Telegram is connected; when it is not, a reason is
 * shown below the description instead of just dimming the row, so the
 * disabled state is never conveyed by opacity/color alone.
 */
const AlertRow = ({
  icon: RowIcon,
  iconColor,
  title,
  description,
  reason,
  ...switchProps
}) => (
  <Flex
    align="center"
    justify="space-between"
    gap={4}
    p={4}
    borderRadius="md"
    borderWidth="1px"
    borderColor="border"
  >
    <Flex align="center" gap={4} flex={1}>
      <Box p={2} borderRadius="md" bg="bg.muted" color={iconColor}>
        <Icon as={RowIcon} size="lg" />
      </Box>
      <Box>
        <Text fontWeight="medium" mb={1}>
          {title}
        </Text>
        <Text textStyle="caption" color="fg.muted">
          {description}
        </Text>
        {reason && (
          <Text textStyle="caption" color="fg.muted" mt={1}>
            {reason}
          </Text>
        )}
      </Box>
    </Flex>
    <Switch size="lg" aria-label={title} {...switchProps} />
  </Flex>
);

/**
 * The "Notifications" settings section: the Telegram integration checklist
 * and the two alert toggles it gates.
 *
 * @param {object} props
 * @param {string} props.telegramBotToken
 * @param {(value: string) => void} props.onTelegramBotTokenChange
 * @param {string} props.savedTelegramBotToken
 * @param {boolean} props.isTelegramBotTokenDirty
 * @param {boolean} props.isPriceDropAlert
 * @param {(value: boolean) => void} props.onPriceDropAlertChange
 * @param {boolean} props.isStockChangeAlert
 * @param {(value: boolean) => void} props.onStockChangeAlertChange
 */
export const NotificationsSection = ({
  telegramBotToken,
  onTelegramBotTokenChange,
  savedTelegramBotToken,
  isTelegramBotTokenDirty,
  isPriceDropAlert,
  onPriceDropAlertChange,
  isStockChangeAlert,
  onStockChangeAlertChange
}) => {
  const { t } = useTranslation();
  const telegramStatus = useConfigStore(
    (state) => state.config?.telegram_status ?? 'not_configured'
  );
  const isConnected = telegramStatus === 'connected';
  const reason = isConnected
    ? null
    : t(
        `pages.settings.alerts.reason.${telegramStatus === 'token_only' ? 'tokenOnly' : 'notConfigured'}`
      );

  return (
    <SettingsSection
      id="notifications"
      title={t('pages.settings.sections.notifications')}
    >
      <TelegramSetup
        tokenValue={telegramBotToken}
        onTokenChange={onTelegramBotTokenChange}
        savedToken={savedTelegramBotToken}
        isTokenDirty={isTelegramBotTokenDirty}
      />

      <VStack gap={3} align="stretch">
        <AlertRow
          icon={LuTrendingDown}
          iconColor="price.down"
          title={t('pages.settings.alerts.priceDrop.title')}
          description={t('pages.settings.alerts.priceDrop.description')}
          reason={reason}
          checked={isPriceDropAlert}
          onCheckedChange={(e) => onPriceDropAlertChange(e.checked)}
          disabled={!isConnected}
        />
        <AlertRow
          icon={LuPackage}
          iconColor="stock.in"
          title={t('pages.settings.alerts.stockChange.title')}
          description={t('pages.settings.alerts.stockChange.description')}
          reason={reason}
          checked={isStockChangeAlert}
          onCheckedChange={(e) => onStockChangeAlertChange(e.checked)}
          disabled={!isConnected}
        />
      </VStack>
    </SettingsSection>
  );
};
