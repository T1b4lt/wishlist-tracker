import { useMemo } from 'react';
import { Link, createListCollection } from '@chakra-ui/react';
import { Trans, useTranslation } from 'react-i18next';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { SecretInput } from './SecretInput';
import { SettingsSection } from './SettingsSection';

/**
 * The "General" settings section: display language and the Google API key
 * used to extract product info from URLs.
 *
 * @param {object} props
 * @param {string} props.language
 * @param {(value: string) => void} props.onLanguageChange - Only updates the
 *   draft: the language is applied and persisted after a successful Save
 *   (see `configStore.save`).
 * @param {string} props.googleApiKey
 * @param {(value: string) => void} props.onGoogleApiKeyChange
 * @param {string} props.savedGoogleApiKey
 */
export const GeneralSection = ({
  language,
  onLanguageChange,
  googleApiKey,
  onGoogleApiKeyChange,
  savedGoogleApiKey
}) => {
  const { t } = useTranslation();

  const languageCollection = useMemo(
    () =>
      createListCollection({
        items: SUPPORTED_LANGUAGES.map((value) => ({
          label: t(`common.language.${value}`),
          value
        }))
      }),
    [t]
  );

  return (
    <SettingsSection id="general" title={t('pages.settings.sections.general')}>
      <Field label={t('pages.settings.fields.language')}>
        <SelectRoot
          collection={languageCollection}
          value={[language]}
          onValueChange={(details) => {
            const nextLanguage = details.value[0];
            if (nextLanguage) onLanguageChange(nextLanguage);
          }}
          size="md"
          maxW="240px"
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
    </SettingsSection>
  );
};
