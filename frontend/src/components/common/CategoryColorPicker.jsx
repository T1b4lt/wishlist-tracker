import { Box, Flex, Grid, Input, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_COLOR_SWATCHES } from '@/lib/categoryColors';

/**
 * A category color picker: a grid of preset swatches plus a native color
 * input for any custom value. Fully controlled (`value`/`onChange`) so it
 * can be embedded both in `CategoryModal` and in `ProductFormDialog`'s
 * "new category" popover.
 *
 * @param {object} props
 * @param {string} props.value - The currently selected color (any CSS color
 *   value; only exact matches against `CATEGORY_COLOR_SWATCHES` are shown as
 *   selected in the grid).
 * @param {(color: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export const CategoryColorPicker = ({ value, onChange, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <Box>
      <Text fontWeight="medium" mb={3}>
        {t('components.categoryColorPicker.label')}
      </Text>
      <Grid templateColumns="repeat(6, 1fr)" gap={3} mb={4}>
        {CATEGORY_COLOR_SWATCHES.map((color) => (
          <Box
            key={color}
            as="button"
            type="button"
            aria-label={t('components.categoryColorPicker.swatchLabel', {
              hex: color
            })}
            aria-pressed={value === color}
            disabled={disabled}
            w="40px"
            h="40px"
            borderRadius="full"
            bg={color}
            cursor="pointer"
            border={value === color ? '3px solid' : '2px solid transparent'}
            borderColor={value === color ? 'fg' : 'transparent'}
            transitionProperty="transform, box-shadow"
            transitionDuration="fast"
            transitionTimingFunction="easeOut"
            _hover={{ transform: 'scale(1.1)', boxShadow: 'lg' }}
            _motionReduce={{ _hover: { transform: 'none' } }}
            onClick={() => onChange(color)}
          />
        ))}
      </Grid>
      <Flex align="center" gap={3}>
        <Input
          type="color"
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
