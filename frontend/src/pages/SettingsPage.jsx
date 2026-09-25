import { useEffect, useState } from 'react';
import { Box, Grid } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { ConfirmDialog, ErrorState, LoadingState } from '@/components/common';
import {
  AnalysisSection,
  GeneralSection,
  NotificationsSection,
  SaveBar,
  SettingsNav
} from '@/components/settings';
import { toaster } from '@/components/ui/toaster';
import { useConfigStore } from '@/stores/configStore';
import {
  buildConfigPatch,
  draftFromConfig,
  isDraftDirty,
  mergeUpstreamChanges
} from '@/lib/settingsDraft';

/** Draft shape before the first config load. Overwritten wholesale by the
 * config-derived draft on that first load (see the reconciliation below). */
const DEFAULT_DRAFT = {
  selected_language: 'english',
  analysis_hour: 12,
  hist_window_size: 60,
  google_api_key: '',
  telegram_bot_token: '',
  is_price_drop_alert: false,
  is_stock_change_alert: false
};

const SettingsPage = () => {
  const { t } = useTranslation();
  useDocumentTitle(t('pages.settings.title'));

  const configStatus = useConfigStore((state) => state.status);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetch);
  const saveConfig = useConfigStore((state) => state.save);

  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [baseline, setBaseline] = useState(DEFAULT_DRAFT);
  const [syncedConfig, setSyncedConfig] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Reconcile the draft whenever the config store (re)loads *in the
  // background*: the initial fetch, or a forced refresh (e.g.
  // `NotificationsSection` -> `TelegramSetup` calling `fetch(true)` after
  // obtaining a Telegram chat id). A save is handled separately, directly
  // in `handleSave` below (it resyncs the draft/baseline from the saved
  // config unconditionally, rather than through `mergeUpstreamChanges`), so
  // this branch only ever runs for the initial load or a background
  // refresh. On the very first load the draft simply becomes the
  // config-derived baseline; afterward, `mergeUpstreamChanges` keeps any
  // field the user has since edited and only adopts the new value for
  // fields still untouched, so a background refresh can never discard an
  // in-progress, unrelated edit (see `src/lib/settingsDraft.js`). Done
  // during render (instead of in an effect) to avoid an extra render pass:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (config && syncedConfig !== config) {
    const nextBaseline = draftFromConfig(config);
    setDraft((prevDraft) =>
      syncedConfig === null
        ? nextBaseline
        : mergeUpstreamChanges(prevDraft, baseline, nextBaseline)
    );
    setBaseline(nextBaseline);
    setSyncedConfig(config);
  }

  const isDirty = config !== null && isDraftDirty(draft, baseline);
  const { isConfirmOpen, confirmNavigation, cancelNavigation } =
    useUnsavedChangesGuard(isDirty);

  const setField = (field) => (value) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const handleDiscard = () => setDraft(baseline);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await saveConfig(buildConfigPatch(draft));
      // Resync the draft and baseline directly from what was actually
      // saved, rather than letting the render-time reconciliation above
      // merge it in: every field in the patch was just saved, so the form
      // must end clean regardless of `mergeUpstreamChanges`'s "keep it if
      // it still differs from the previous baseline" rule (which otherwise
      // never adopts the new value for a field the user just edited).
      // `syncedConfig` is set to the same `saved` reference the store just
      // stored as `config`, so the reconciliation branch above sees nothing
      // new to process for this update.
      const savedDraft = draftFromConfig(saved);
      setDraft(savedDraft);
      setBaseline(savedDraft);
      setSyncedConfig(saved);
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
          message={t('toasts.settings.loadError.description')}
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

      <Grid
        templateColumns={{ base: '1fr', md: '200px 1fr' }}
        gap={8}
        // Extra bottom room so the sticky `SaveBar` never covers the last
        // section's content once it slides in.
        mb={isDirty ? { base: 28, md: 10 } : 0}
      >
        <SettingsNav />
        <Box display="flex" flexDirection="column" gap={8} minW={0}>
          <GeneralSection
            language={draft.selected_language}
            onLanguageChange={setField('selected_language')}
            googleApiKey={draft.google_api_key}
            onGoogleApiKeyChange={setField('google_api_key')}
            savedGoogleApiKey={config.google_api_key || ''}
          />
          <AnalysisSection
            analysisHour={draft.analysis_hour}
            onAnalysisHourChange={setField('analysis_hour')}
            histWindowSize={draft.hist_window_size}
            onHistWindowSizeChange={setField('hist_window_size')}
          />
          <NotificationsSection
            telegramBotToken={draft.telegram_bot_token}
            onTelegramBotTokenChange={setField('telegram_bot_token')}
            savedTelegramBotToken={config.telegram_bot_token || ''}
            isTelegramBotTokenDirty={
              draft.telegram_bot_token !== baseline.telegram_bot_token
            }
            isPriceDropAlert={draft.is_price_drop_alert}
            onPriceDropAlertChange={setField('is_price_drop_alert')}
            isStockChangeAlert={draft.is_stock_change_alert}
            onStockChangeAlertChange={setField('is_stock_change_alert')}
          />
        </Box>
      </Grid>

      <SaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <ConfirmDialog
        open={isConfirmOpen}
        onClose={cancelNavigation}
        onConfirm={confirmNavigation}
        title={t('pages.settings.leaveConfirm.title')}
        body={t('pages.settings.leaveConfirm.body')}
        confirmLabel={t('pages.settings.leaveConfirm.confirm')}
        destructive
      />
    </PageContainer>
  );
};

export default SettingsPage;
