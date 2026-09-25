import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Button, Heading, Text } from '@chakra-ui/react';
import { useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { MotionBox } from '@/components/motion';
import { durationSeconds, easeOut } from '@/theme/motion';

/** Number of lines the collapsed description clamps to. */
const CLAMP_LINES = 4;

/**
 * The product detail page's description: clamped to `CLAMP_LINES` lines,
 * with a "Show more" / "Show less" toggle rendered only when the text
 * actually overflows that clamp. The clamp/full switch is wrapped in a
 * `layout`-animated `MotionBox` (a Framer Motion FLIP transform, not a raw
 * `height` transition) so the surrounding content smoothly resizes around
 * it, honoring `prefers-reduced-motion` like every other preset.
 *
 * @param {object} props
 * @param {string|null|undefined} props.description - Renders nothing when empty.
 */
export const ProductDescription = ({ description }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const textRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (isExpanded) return;
    const node = textRef.current;
    if (!node) return;
    setIsOverflowing(node.scrollHeight > node.clientHeight + 1);
  }, [description, isExpanded]);

  if (!description) return null;

  return (
    <Box>
      <Heading textStyle="heading.sm" mb={2}>
        {t('pages.product.description.title')}
      </Heading>
      <MotionBox
        layout={!shouldReduceMotion}
        transition={{
          duration: shouldReduceMotion ? 0 : durationSeconds.normal,
          ease: easeOut
        }}
      >
        <Text
          ref={textRef}
          color="fg"
          lineHeight="relaxed"
          lineClamp={isExpanded ? 'none' : CLAMP_LINES}
        >
          {description}
        </Text>
      </MotionBox>
      {isOverflowing && (
        <Button
          variant="ghost"
          size="sm"
          px={0}
          mt={1}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded
            ? t('pages.product.description.showLess')
            : t('pages.product.description.showMore')}
        </Button>
      )}
    </Box>
  );
};
