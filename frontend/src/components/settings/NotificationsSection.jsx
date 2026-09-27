import { useMemo } from 'react';
import {
  Box,
  createListCollection,
  Flex,
  Icon,
  Text,
  VStack
} from '@chakra-ui/react';
import { LuPackage, LuTrendingDown } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui/field';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
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
 * The "Notifications" settings section: the Telegram integration checklist,
 * the two alert toggles and the daily check report select it gates.
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
 * @param {string} props.dailyCheckReport - One of `dailyCheckReportOptions`.
 * @param {(value: string) => void} props.onDailyCheckReportChange
 * @param {string[]} props.dailyCheckReportOptions -
 *   `config.daily_check_report_options`.
 */
export const NotificationsSection = ({
  telegramBotToken,
  onTelegramBotTokenChange,
  savedTelegramBotToken,
  isTelegramBotTokenDirty,
  isPriceDropAlert,
  onPriceDropAlertChange,
  isStockChangeAlert,
  onStockChangeAlertChange,
  dailyCheckReport,
  onDailyCheckReportChange,
  dailyCheckReportOptions
}) => {
  const { t } = useTranslation();
  const telegramStatus = useConfigStore(
    (state) => state.config?.telegram_status ?? 'not_configured'
  );
  const isConnected = telegramStatus === 'connected';
  const dailyReportCollection = useMemo(
    () =>
      createListCollection({
        items: dailyCheckReportOptions.map((value) => ({
          value,
          label: t(`pages.settings.alerts.dailyReport.options.${value}`)
        }))
      }),
    [dailyCheckReportOptions, t]
  );
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
        <Field
          label={t('pages.settings.alerts.dailyReport.title')}
          helperText={
            reason ?? t('pages.settings.alerts.dailyReport.description')
          }
          disabled={!isConnected}
        >
          <SelectRoot
            collection={dailyReportCollection}
            value={[dailyCheckReport]}
            onValueChange={(details) => {
              const next = details.value[0];
              if (next) onDailyCheckReportChange(next);
            }}
            disabled={!isConnected}
            size="md"
          >
            <SelectTrigger>
              <SelectValueText />
            </SelectTrigger>
            <SelectContent>
              {dailyReportCollection.items.map((item) => (
                <SelectItem key={item.value} item={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRoot>
        </Field>
      </VStack>
    </SettingsSection>
  );
};
