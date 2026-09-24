import { Box, Text } from '@chakra-ui/react';
import { useReducedMotion } from 'motion/react';
import { LineChart, Line, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';

/**
 * A tiny, axis-less price trend line for a table row or card: draws in on
 * mount (disabled under reduced motion), otherwise purely decorative (the
 * price/change columns already convey the numbers).
 *
 * @param {object} props
 * @param {number[]|null|undefined} props.values - `recent_prices`, oldest to
 *   newest. Renders a muted "not available" label instead of a chart when
 *   there are fewer than two usable points.
 * @param {number} [props.width] - Defaults to `96` (px).
 * @param {number} [props.height] - Defaults to `28` (px).
 */
export const Sparkline = ({ values, width = 96, height = 28 }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  const points = Array.isArray(values)
    ? values.filter(
        (value) => typeof value === 'number' && Number.isFinite(value)
      )
    : [];

  if (points.length < 2) {
    return (
      <Text textStyle="body" color="fg.muted">
        {t('common.messages.notAvailable')}
      </Text>
    );
  }

  const data = points.map((value, index) => ({ index, value }));

  return (
    <Box
      width={`${width}px`}
      height={`${height}px`}
      aria-hidden="true"
      // recharts warns when a `ResponsiveContainer` measures 0x0, which
      // happens whenever this sits in a `display:none` ancestor (e.g. the
      // table hidden below `md`); a fixed size is what this component
      // asks for anyway, so it skips `ResponsiveContainer`'s own
      // measuring entirely instead of fighting that warning.
    >
      <LineChart
        width={width}
        height={height}
        data={data}
        margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      >
        {/* Hidden: only scales the line to its own data range (no implicit
            zero baseline), never rendered as a visible axis. */}
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--chakra-colors-fg-muted)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={!shouldReduceMotion}
        />
      </LineChart>
    </Box>
  );
};
