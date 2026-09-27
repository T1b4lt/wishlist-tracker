import { Badge, Icon } from '@chakra-ui/react';
import { LuClockAlert } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * A warning badge for a product whose price the backend reports as stale
 * (`stale_days`): an icon plus "No updates for N days", with a tooltip
 * listing the likely causes. Renders nothing when `days` is not a number.
 * The badge text stands on its own, so the tooltip only adds detail.
 *
 * @param {object} props
 * @param {number|null|undefined} props.days - The product's `stale_days`.
 * @param {string[]} [props.storeNames] - Stale stores, listed in the
 *   tooltip for a product tracked in several stores.
 * @param {object} [rest] - Forwarded to the underlying `Badge`.
 */
export const StaleBadge = ({ days, storeNames, ...rest }) => {
  const { t } = useTranslation();

  if (typeof days !== 'number') return null;

  const hint = t('common.status.staleHint');
  const content =
    storeNames && storeNames.length > 0
      ? `${t('common.status.staleStores', { stores: storeNames.join(', ') })} ${hint}`
      : hint;

  return (
    <Tooltip content={content} showArrow>
      <Badge
        variant="subtle"
        colorPalette="orange"
        display="inline-flex"
        alignItems="center"
        gap={1}
        {...rest}
      >
        <Icon as={LuClockAlert} size="xs" />
        {t('common.status.stale', { count: days })}
      </Badge>
    </Tooltip>
  );
};
