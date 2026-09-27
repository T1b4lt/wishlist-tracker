import { useMemo } from 'react';
import {
  Alert,
  HStack,
  IconButton,
  Input,
  Link,
  Spinner,
  Text,
  createListCollection
} from '@chakra-ui/react';
import { LuRefreshCw } from 'react-icons/lu';
import { Trans, useTranslation } from 'react-i18next';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Field } from '@/components/ui/field';
import { useOllamaModels } from '@/hooks/useOllamaModels';
import { SecretInput } from './SecretInput';
import { SettingsSection } from './SettingsSection';

/**
 * The "AI provider" settings section: which provider runs the AI
 * extraction (Google AI Studio or a self-hosted Ollama) and its settings.
 * Ollama's models come from the backend (`GET /ai/ollama/models`), which
 * also flags the small ones; a saved model missing from the instance stays
 * listed (marked not available) so saving never blanks it silently.
 *
 * @param {object} props
 * @param {string} props.provider - `config.ai_provider`.
 * @param {(value: string) => void} props.onProviderChange
 * @param {string[]} props.providerOptions - `config.ai_provider_options`.
 * @param {string} props.googleApiKey
 * @param {(value: string) => void} props.onGoogleApiKeyChange
 * @param {string} props.savedGoogleApiKey
 * @param {string} props.ollamaUrl
 * @param {(value: string) => void} props.onOllamaUrlChange
 * @param {string} props.ollamaModel
 * @param {(value: string) => void} props.onOllamaModelChange
 * @param {number} [props.modelsDelayMs] - Debounce of the model list (tests).
 */
export const AIProviderSection = ({
  provider,
  onProviderChange,
  providerOptions,
  googleApiKey,
  onGoogleApiKeyChange,
  savedGoogleApiKey,
  ollamaUrl,
  onOllamaUrlChange,
  ollamaModel,
  onOllamaModelChange,
  modelsDelayMs
}) => {
  const { t } = useTranslation();
  const isOllama = provider === 'ollama';
  const models = useOllamaModels(ollamaUrl, {
    enabled: isOllama,
    delayMs: modelsDelayMs
  });

  const providerCollection = useMemo(
    () =>
      createListCollection({
        items: providerOptions.map((value) => ({
          label: t(`pages.settings.fields.aiProvider.options.${value}`),
          value
        }))
      }),
    [providerOptions, t]
  );

  const modelCollection = useMemo(() => {
    const items = models.models.map((model) => ({
      label: model.parameter_size
        ? `${model.name} · ${model.parameter_size}`
        : model.name,
      value: model.name
    }));
    const isMissing =
      ollamaModel &&
      models.status === 'success' &&
      !items.some((item) => item.value === ollamaModel);
    if (isMissing) {
      items.unshift({
        label: t('pages.settings.fields.ollamaModel.notAvailable', {
          model: ollamaModel
        }),
        value: ollamaModel
      });
    }
    return createListCollection({ items });
  }, [models.models, models.status, ollamaModel, t]);

  const selectedModel = models.models.find(
    (model) => model.name === ollamaModel
  );

  return (
    <SettingsSection
      id="ai-provider"
      title={t('pages.settings.sections.aiProvider')}
    >
      <Field
        label={t('pages.settings.fields.aiProvider.label')}
        helperText={t('pages.settings.fields.aiProvider.helper')}
      >
        <SegmentedControl
          hideBelow="sm"
          items={providerCollection.items}
          value={provider}
          onValueChange={(e) => onProviderChange(e.value)}
          size="md"
        />
        <SelectRoot
          hideFrom="sm"
          collection={providerCollection}
          value={[provider]}
          onValueChange={(details) => {
            const next = details.value[0];
            if (next) onProviderChange(next);
          }}
          size="md"
        >
          <SelectTrigger>
            <SelectValueText />
          </SelectTrigger>
          <SelectContent>
            {providerCollection.items.map((item) => (
              <SelectItem key={item.value} item={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </Field>

      {!isOllama && (
        <SecretInput
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
                    color="fg"
                    textDecoration="underline"
                  />
                )
              }}
            />
          }
          value={googleApiKey}
          onChange={onGoogleApiKeyChange}
          savedValue={savedGoogleApiKey}
          placeholder={t('common.placeholders.googleApiKey')}
        />
      )}

      {isOllama && (
        <>
          <Field
            label={t('pages.settings.fields.ollamaUrl.label')}
            helperText={t('pages.settings.fields.ollamaUrl.helper')}
          >
            <Input
              value={ollamaUrl}
              onChange={(e) => onOllamaUrlChange(e.target.value)}
              placeholder={t('pages.settings.fields.ollamaUrl.placeholder')}
              inputMode="url"
              autoComplete="off"
            />
          </Field>

          <Field
            label={t('pages.settings.fields.ollamaModel.label')}
            helperText={t('pages.settings.fields.ollamaModel.helper')}
            errorText={
              models.status === 'error'
                ? t('pages.settings.fields.ollamaModel.loadError', {
                    detail: models.error
                  })
                : undefined
            }
            invalid={models.status === 'error'}
          >
            {models.status === 'idle' ? (
              <Text textStyle="body" color="fg.muted">
                {t('pages.settings.fields.ollamaModel.enterUrl')}
              </Text>
            ) : (
              <HStack w="full" gap={2}>
                <SelectRoot
                  collection={modelCollection}
                  value={ollamaModel ? [ollamaModel] : []}
                  onValueChange={(details) => {
                    const next = details.value[0];
                    if (next) onOllamaModelChange(next);
                  }}
                  disabled={models.status !== 'success'}
                  size="md"
                  flex="1"
                >
                  <SelectTrigger>
                    <SelectValueText
                      placeholder={
                        models.status === 'loading'
                          ? t('pages.settings.fields.ollamaModel.loading')
                          : t('pages.settings.fields.ollamaModel.placeholder')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modelCollection.items.map((item) => (
                      <SelectItem key={item.value} item={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
                <IconButton
                  aria-label={t('pages.settings.fields.ollamaModel.refresh')}
                  variant="outline"
                  size="md"
                  onClick={models.refresh}
                  disabled={models.status === 'loading'}
                >
                  {models.status === 'loading' ? (
                    <Spinner size="sm" />
                  ) : (
                    <LuRefreshCw />
                  )}
                </IconButton>
              </HStack>
            )}
          </Field>

          {selectedModel?.is_small && (
            <Alert.Root status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {t('pages.settings.fields.ollamaModel.smallWarning', {
                    threshold: models.threshold
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
        </>
      )}
    </SettingsSection>
  );
};
