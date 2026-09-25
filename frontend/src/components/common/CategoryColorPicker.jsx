import {
  Box,
  Flex,
  Grid,
  Input,
  RadioGroup,
  Text,
  VisuallyHidden
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  CATEGORY_COLOR_NAMES,
  CATEGORY_COLOR_SWATCHES
} from '@/lib/categoryColors';

/**
 * A category color picker: a radio group of preset swatches plus a native
 * color input for any custom value. Fully controlled (`value`/`onChange`)
 * so it can be embedded both in `CategoryFormDialog` and in
 * `ProductFormDialog`'s "new category" popover.
 *
 * The swatches are real radio inputs (one native group, sharing a `name`),
 * so left/right and up/down arrow keys move the browser's own roving
 * selection between them; each carries an `aria-label`-equivalent
 * accessible name (its color, e.g. "Red"/"Rojo", via a visually hidden
 * `RadioGroup.ItemText`) instead of a raw hex code. The selected swatch
 * scales up slightly (`_checked`), skipped entirely when the user prefers
 * reduced motion (`_motionReduce`).
 *
 * @param {object} props
 * @param {string} props.value - The currently selected color (any CSS color
 *   value; only exact matches against `CATEGORY_COLOR_SWATCHES` are shown as
 *   checked in the radio group).
 * @param {(color: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export const CategoryColorPicker = ({ value, onChange, disabled = false }) => {
  const { t } = useTranslation();
  const presetValue = CATEGORY_COLOR_SWATCHES.includes(value) ? value : '';

  return (
    <Box>
      <RadioGroup.Root
        value={presetValue}
        onValueChange={(details) => onChange(details.value)}
        disabled={disabled}
        mb={4}
      >
        <RadioGroup.Label>
          <Text fontWeight="medium" mb={3}>
            {t('components.categoryColorPicker.label')}
          </Text>
        </RadioGroup.Label>
        <Grid templateColumns="repeat(6, 1fr)" gap={3}>
          {CATEGORY_COLOR_SWATCHES.map((color, index) => (
            <RadioGroup.Item key={color} value={color}>
              <VisuallyHidden asChild>
                <RadioGroup.ItemText>
                  {t(
                    `components.categoryColorPicker.colorNames.${CATEGORY_COLOR_NAMES[index]}`
                  )}
                </RadioGroup.ItemText>
              </VisuallyHidden>
              <RadioGroup.ItemControl
                w="40px"
                h="40px"
                borderRadius="full"
                bg={color}
                cursor="pointer"
                borderWidth="2px"
                borderColor="transparent"
                transitionProperty="transform, box-shadow, border-color"
                transitionDuration="fast"
                transitionTimingFunction="easeOut"
                _checked={{ borderColor: 'fg', transform: 'scale(1.08)' }}
                _motionReduce={{ transform: 'none' }}
                _focusVisible={{
                  outline: '2px solid',
                  outlineColor: 'fg',
                  outlineOffset: '2px'
                }}
              />
              <RadioGroup.ItemHiddenInput />
            </RadioGroup.Item>
          ))}
        </Grid>
      </RadioGroup.Root>
      <Flex align="center" gap={3}>
        <Input
          type="color"
          aria-label={t('components.categoryColorPicker.customColor')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          w="60px"
          h="40px"
          p={1}
          cursor="pointer"
        />
        <Text fontSize="sm" color="fg.muted">
          {t('components.categoryColorPicker.customColor')}
        </Text>
      </Flex>
    </Box>
  );
};
