import { HStack, Text } from '@chakra-ui/react';
import { LuPackageCheck, LuPackageX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';

/**
 * A stock status indicator: an icon plus the translated "In Stock" / "Out of
 * Stock" text, colored from the `stock.*` semantic tokens. Text is always
 * present alongside the icon and the color, so stock status is never read
 * from color alone.
 *
 * @param {object} props
 * @param {boolean|null|undefined} props.inStock - `true`/`false` for a known
 *   status, `null`/`undefined` when stock is not tracked for this product.
 * @param {object} [rest] - Forwarded to the underlying `HStack` (or `Text`
 *   for the unknown-status case).
 */
export const StockStatus = ({ inStock, ...rest }) => {
  const { t } = useTranslation();

  if (inStock === null || inStock === undefined) {
    return (
      <Text textStyle="body" color="fg.muted" {...rest}>
        {t('common.messages.notAvailable')}
      </Text>
    );
  }

  const Icon = inStock ? LuPackageCheck : LuPackageX;
  const color = inStock ? 'stock.in' : 'stock.out';
  const label = inStock
    ? t('common.status.inStock')
    : t('common.status.outOfStock');

  return (
    <HStack gap={1.5} color={color} {...rest}>
      <Icon size={14} aria-hidden="true" />
      <Text textStyle="body">{label}</Text>
    </HStack>
  );
};
