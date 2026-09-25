import { Badge } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { getPriorityLabel } from '@/lib/web_utils';
import { PRIORITY_ICONS, PRIORITY_FONT_WEIGHTS } from '@/lib/priorityVisuals';

/**
 * A neutral pill badge for a product's priority: an icon whose shape carries
 * the weight (a full, half or single signal bar) plus the translated label,
 * set in a matching font weight. Deliberately colorless (a single neutral
 * `gray` palette for every priority) so priority is never read from hue
 * alone.
 *
 * @param {object} props
 * @param {'high'|'medium'|'low'|string} props.priority - Product priority
 *   value (matched case-insensitively; an unknown value still renders the
 *   raw text via `getPriorityLabel`, with the medium icon and weight).
 * @param {object} [rest] - Forwarded to the underlying `Badge`.
 */
export const PriorityBadge = ({ priority, ...rest }) => {
  const { t } = useTranslation();

  if (!priority) return null;

  const normalized = priority.toLowerCase();
  const Icon = PRIORITY_ICONS[normalized] ?? PRIORITY_ICONS.medium;
  const fontWeight = PRIORITY_FONT_WEIGHTS[normalized] ?? 'medium';

  return (
    <Badge
      variant="subtle"
      colorPalette="gray"
      display="inline-flex"
      alignItems="center"
      gap={1}
      fontWeight={fontWeight}
      {...rest}
    >
      <Icon size={12} aria-hidden="true" />
      {getPriorityLabel(priority, t)}
    </Badge>
  );
};
