import { useId, useLayoutEffect, useRef, useState } from 'react';
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
 * While collapsed, a `ResizeObserver` keeps the overflow check (and so the
 * toggle's visibility) in sync with the text node's actual size, not just
 * its `description`: a viewport/container width change can be enough to
 * make previously-clamped text fit (or previously-fitting text overflow)
 * without either `description` or `isExpanded` ever changing.
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
  const contentId = useId();

  useLayoutEffect(() => {
    if (isExpanded) return;
    const node = textRef.current;
    if (!node) return;

    const measure = () =>
      setIsOverflowing(node.scrollHeight > node.clientHeight + 1);
    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
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
          id={contentId}
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
          aria-expanded={isExpanded}
          aria-controls={contentId}
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
