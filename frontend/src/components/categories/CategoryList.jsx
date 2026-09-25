import {
  Box,
  Card,
  Flex,
  HStack,
  IconButton,
  Skeleton,
  Text,
  VStack
} from '@chakra-ui/react';
import { useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { LuPencil, LuTrash2 } from 'react-icons/lu';
import { AnimatedList, AnimatedListItem } from '@/components/motion';
import { durationSeconds, easeOut, staggerStepSeconds } from '@/theme/motion';
import { CategoryTag } from '@/components/common';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * Grid template shared by `CategoryList` and `CategoryListSkeleton`, so the
 * loading state uses the exact same column count at any given width as the
 * real grid it is standing in for (part of "no layout shift" between the
 * two: see `CategoryListSkeleton`).
 */
const CATEGORY_GRID_TEMPLATE_COLUMNS = 'repeat(auto-fill, minmax(280px, 1fr))';

const CategoryCard = ({ category, index, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const count = category.product_count ?? 0;
  const canDelete = count === 0;

  // A native `disabled` button fires neither pointer nor focus events, so
  // the tooltip explaining *why* delete is blocked could never show nor be
  // reached by keyboard. `aria-disabled` keeps it a real, focusable,
  // hoverable button (Chakra's `_disabled` style already matches
  // `[aria-disabled=true]`, so it still looks disabled) while the guarded
  // `onClick` below keeps it inert.
  const deleteButton = (
    <IconButton
      aria-label={t('pages.categories.aria.deleteCategory', {
        name: category.name
      })}
      variant="ghost"
      colorPalette="red"
      size="sm"
      aria-disabled={!canDelete}
      onClick={() => {
        if (canDelete) onDelete(category);
      }}
    >
      <LuTrash2 aria-hidden="true" />
    </IconButton>
  );

  return (
    <AnimatedListItem
      as="li"
      transition={{
        duration: shouldReduceMotion ? 0 : durationSeconds.normal,
        ease: easeOut,
        delay: shouldReduceMotion ? 0 : index * staggerStepSeconds
      }}
    >
      <Card.Root p={5} shadow="sm">
        <Flex justify="space-between" align="center" gap={3}>
          <VStack align="flex-start" gap={1.5} flex={1} minW={0}>
            <CategoryTag name={category.name} color={category.color} />
            <Text fontSize="sm" color="fg.muted">
              {t('pages.categories.productCount', { count })}
            </Text>
          </VStack>
          <HStack gap={1} flexShrink={0}>
            <IconButton
              aria-label={t('pages.categories.aria.editCategory', {
                name: category.name
              })}
              variant="ghost"
              size="sm"
              onClick={() => onEdit(category)}
            >
              <LuPencil aria-hidden="true" />
            </IconButton>
            {canDelete ? (
              deleteButton
            ) : (
              <Tooltip
                content={t('pages.categories.deleteDisabledTooltip', { count })}
                openDelay={0}
                closeDelay={0}
              >
                {deleteButton}
              </Tooltip>
            )}
          </HStack>
        </Flex>
      </Card.Root>
    </AnimatedListItem>
  );
};

/**
 * The categories grid: a card per category (color + name via `CategoryTag`,
 * "{count} products", edit and delete icon buttons). Delete is disabled
 * (with a tooltip explaining why) while the category still has products
 * assigned; `onDelete` is only ever called for a category with none.
 *
 * Cards fade/slide in with a short stagger on mount and animate out (height
 * collapsing) on removal, via `AnimatedList`/`AnimatedListItem` (see
 * `ProductCardList`/`ProductTable` for the same pattern), respecting
 * reduced motion.
 *
 * @param {object} props
 * @param {object[]} props.categories - `GET /categories/` rows (each with
 *   `product_count`).
 * @param {(category: object) => void} props.onEdit
 * @param {(category: object) => void} props.onDelete
 */
export const CategoryList = ({ categories, onEdit, onDelete }) => (
  <AnimatedList
    as="ul"
    listStyleType="none"
    display="grid"
    gridTemplateColumns={CATEGORY_GRID_TEMPLATE_COLUMNS}
    gap={4}
  >
    {categories.map((category, index) => (
      <CategoryCard
        key={category.id}
        category={category}
        index={index}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ))}
  </AnimatedList>
);

/**
 * `CategoryList`'s loading placeholder. Mirrors `CategoryCard`'s exact
 * layout (same `Card.Root` padding, the same `Flex`/`VStack`/`HStack`
 * structure and gaps, `Skeleton`s sized to the real name tag, product-count
 * line and the two `size="sm"` icon buttons) and the same
 * `CATEGORY_GRID_TEMPLATE_COLUMNS` grid, so swapping this out for the real
 * `CategoryList` once data arrives does not reflow the page: same column
 * count at any given width, no card-height jump.
 *
 * @param {object} props
 * @param {number} [props.count] - Number of placeholder cards. Defaults to `6`.
 */
export const CategoryListSkeleton = ({ count = 6 }) => (
  <Box
    display="grid"
    gridTemplateColumns={CATEGORY_GRID_TEMPLATE_COLUMNS}
    gap={4}
    role="status"
    aria-busy="true"
  >
    {Array.from({ length: count }, (_, index) => (
      <Card.Root key={index} p={5} shadow="sm">
        <Flex justify="space-between" align="center" gap={3}>
          <VStack align="flex-start" gap={1.5} flex={1} minW={0}>
            <Skeleton height="20px" width="55%" borderRadius="full" />
            <Skeleton height="16px" width="35%" />
          </VStack>
          <HStack gap={1} flexShrink={0}>
            <Skeleton boxSize="36px" borderRadius="md" />
            <Skeleton boxSize="36px" borderRadius="md" />
          </HStack>
        </Flex>
      </Card.Root>
    ))}
  </Box>
);
