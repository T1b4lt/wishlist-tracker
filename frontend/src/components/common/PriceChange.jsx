import { HStack, Text } from '@chakra-ui/react';
import { LuTrendingUp, LuTrendingDown, LuMinus } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { formatPercent, getTrend } from '@/lib/format';

const TREND_ICONS = {
  up: LuTrendingUp,
  down: LuTrendingDown,
  flat: LuMinus
};

/** Semantic color token per trend. Paired with an icon and a sign, never used alone. */
const TREND_COLOR_TOKENS = {
  up: 'price.up',
  down: 'price.down',
  flat: 'price.flat'
};

/**
 * A price change indicator: a signed percentage, an icon for its direction
 * and a `price.*` semantic color, so the direction is never carried by
 * color alone.
 *
 * @param {object} props
 * @param {number|null|undefined} props.value - The percentage change (e.g. `-3.2`
 *   for a 3.2% drop), as used by `getTrend`/`formatPercent`.
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale` in `lib/format.js`.
 * @param {Intl.NumberFormatOptions['signDisplay']} [props.signDisplay] - Forwarded to
 *   `formatPercent`. Defaults to `'exceptZero'` (a sign on every non-flat change).
 * @param {object} [rest] - Forwarded to the underlying `HStack`.
 */
export const PriceChange = ({
  value,
  locale,
  signDisplay = 'exceptZero',
  ...rest
}) => {
  const { t } = useTranslation();
  const trend = getTrend(value);

  if (trend === null) {
    return (
      <Text textStyle="numeric" color="fg.muted" {...rest}>
        {t('common.messages.notAvailable')}
      </Text>
    );
  }

  const Icon = TREND_ICONS[trend];
  const color = TREND_COLOR_TOKENS[trend];

  return (
    <HStack
      gap={1}
      color={color}
      fontWeight="medium"
      textStyle="numeric"
      {...rest}
    >
      <Icon size={14} aria-hidden="true" />
      <Text>{formatPercent(value, locale, { signDisplay })}</Text>
    </HStack>
  );
};
