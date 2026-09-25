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
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Field } from '@/components/ui/field';
import { SettingsSection } from './SettingsSection';

const hourCollection = createListCollection({
  items: Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, '0')}:00`,
    value: i.toString()
  }))
});

const HIST_WINDOW_VALUES = [30, 60, 90, 180];

/**
 * The "Analysis" settings section: the daily analysis hour and the
 * historical window used for price trend calculations. The historical
 * window renders as a (possibly wrapping) segmented control from `sm` up,
 * and as a `Select` below `sm` so it never overflows a 360px viewport.
 *
 * @param {object} props
 * @param {number} props.analysisHour
 * @param {(value: number) => void} props.onAnalysisHourChange
 * @param {number} props.histWindowSize
 * @param {(value: number) => void} props.onHistWindowSizeChange
 */
export const AnalysisSection = ({
  analysisHour,
  onAnalysisHourChange,
  histWindowSize,
  onHistWindowSizeChange
}) => {
  const { t } = useTranslation();

  const histWindowCollection = useMemo(
    () =>
      createListCollection({
        items: HIST_WINDOW_VALUES.map((value) => ({
          label: t('pages.settings.histWindowOption', { days: value }),
          value: value.toString()
        }))
      }),
    [t]
  );

  return (
    <SettingsSection
      id="analysis"
      title={t('pages.settings.sections.analysis')}
    >
      <Field
        label={t('pages.settings.fields.analysisHour.label')}
        helperText={t('pages.settings.fields.analysisHour.helper')}
      >
        <SelectRoot
          collection={hourCollection}
          value={[analysisHour.toString()]}
          onValueChange={(details) =>
            onAnalysisHourChange(parseInt(details.value[0], 10))
          }
          size="md"
          maxW="140px"
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
      >
        <SegmentedControl
          hideBelow="sm"
          flexWrap="wrap"
          items={histWindowCollection.items}
          value={histWindowSize.toString()}
          onValueChange={(e) => onHistWindowSizeChange(parseInt(e.value, 10))}
          size="md"
        />
        <SelectRoot
          hideFrom="sm"
          collection={histWindowCollection}
          value={[histWindowSize.toString()]}
          onValueChange={(details) => {
            const next = details.value[0];
            if (next) onHistWindowSizeChange(parseInt(next, 10));
          }}
          size="md"
        >
          <SelectTrigger>
            <SelectValueText />
          </SelectTrigger>
          <SelectContent>
            {histWindowCollection.items.map((item) => (
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
