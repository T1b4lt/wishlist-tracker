import { useMemo } from 'react';
import { createListCollection } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { SettingsSection } from './SettingsSection';

/**
 * The "General" settings section: display language.
 *
 * @param {object} props
 * @param {string} props.language
 * @param {(value: string) => void} props.onLanguageChange - Only updates the
 *   draft: the language is applied and persisted after a successful Save
 *   (see `configStore.save`).
 */
export const GeneralSection = ({ language, onLanguageChange }) => {
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
    </SettingsSection>
  );
};
