import { Badge, Icon } from '@chakra-ui/react';
import { LuClockAlert } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import {
  STALE_AFTER_DAYS,
  daysSinceCheck,
  nowInSeconds
} from '@/lib/staleness';

/**
 * A warning badge for a product whose price has not been updated for
 * `STALE_AFTER_DAYS` days or more (see `lib/staleness.js`): an icon plus
 * "No updates for N days", with a tooltip listing the likely causes. Renders
 * nothing while the price is up to date or when the product was never
 * checked. The badge text stands on its own, so the tooltip only adds
 * detail.
 *
 * @param {object} props
 * @param {number|null|undefined} props.lastCheckedAt - Unix seconds of the
 *   latest price record (`last_checked_at`).
 * @param {number} [props.now] - Reference Unix time in seconds; defaults to
 *   now (set in tests for deterministic output).
 * @param {object} [rest] - Forwarded to the underlying `Badge`.
 */
export const StaleBadge = ({
  lastCheckedAt,
  now = nowInSeconds(),
  ...rest
}) => {
  const { t } = useTranslation();
  const days = daysSinceCheck(lastCheckedAt, now);

  if (days === null || days < STALE_AFTER_DAYS) return null;

  return (
    <Tooltip content={t('common.status.staleHint')} showArrow>
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
