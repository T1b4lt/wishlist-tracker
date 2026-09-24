import { Card, Table, Text, VStack } from '@chakra-ui/react';
import { useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { AnimatedList, AnimatedListItem } from '@/components/motion';
import { durationSeconds, easeOut } from '@/theme/motion';
import {
  SkeletonRows,
  CategoryTag,
  PriorityBadge,
  PriceChange,
  StockStatus
} from '@/components/common';
import { formatPrice } from '@/lib/format';
import { Sparkline } from './Sparkline';
import { ProductRowActions } from './ProductRowActions';
import { useRowActivation } from './useRowActivation';

/** Cadence between each row's entrance, matching `Stagger`'s own (see `src/components/motion/Stagger.jsx`). */
const STAGGER_DELAY_STEP = 0.04;

const ProductTableRow = ({ product, index, locale, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const activation = useRowActivation(`/product/${product.id}`);

  return (
    <AnimatedListItem
      as="tr"
      {...activation}
      aria-label={t('pages.dashboard.aria.openProduct', {
        name: product.name
      })}
      transitionProperty="background"
      transitionDuration="fast"
      transitionTimingFunction="easeOut"
      _hover={{ bg: 'bg.muted' }}
      focusVisibleRing="inside"
      focusRingWidth="2px"
      focusRingColor="fg"
      transition={{
        duration: shouldReduceMotion ? 0 : durationSeconds.normal,
        ease: easeOut,
        delay: shouldReduceMotion ? 0 : index * STAGGER_DELAY_STEP
      }}
    >
      <Table.Cell>
        <VStack align="flex-start" gap={1}>
          <Text fontWeight="medium" color="fg">
            {product.name}
          </Text>
          <CategoryTag
            name={product.category_name}
            color={product.category_color}
          />
        </VStack>
      </Table.Cell>
      <Table.Cell>
        <PriorityBadge priority={product.priority} />
      </Table.Cell>
      <Table.Cell>
        <Sparkline values={product.recent_prices} />
      </Table.Cell>
      <Table.Cell textAlign="end">
        <Text textStyle="numeric" fontWeight="medium">
          {formatPrice(product.current_price, product.currency, locale)}
        </Text>
      </Table.Cell>
      <Table.Cell textAlign="end">
        <PriceChange
          value={product.price_change_60d}
          locale={locale}
          justify="flex-end"
        />
      </Table.Cell>
      <Table.Cell textAlign="center">
        <StockStatus inStock={product.is_in_stock} justify="center" />
      </Table.Cell>
      <Table.Cell textAlign="center">
        <ProductRowActions
          product={product}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </Table.Cell>
    </AnimatedListItem>
  );
};

/**
 * The `md+` product list: a table with name (+ category tag), priority,
 * trend sparkline, price, change, stock and a row actions menu. Each row
 * navigates to the product's detail page on click and on Enter; clicks
 * inside the actions menu do not (see `ProductRowActions`).
 *
 * @param {object} props
 * @param {object[]} props.products - Dashboard summary rows.
 * @param {boolean} props.isLoading
 * @param {string} props.locale
 * @param {number} props.histWindowSize - Days covered by the "change" column header.
 * @param {(product: object) => void} props.onEdit
 * @param {(product: object) => void} props.onDelete
 */
export const ProductTable = ({
  products,
  isLoading,
  locale,
  histWindowSize,
  onEdit,
  onDelete
}) => {
  const { t } = useTranslation();

  return (
    <Card.Root p={0} overflow="hidden" shadow="sm" hideBelow="md">
      <Table.ScrollArea>
        <Table.Root size="md" variant="line" aria-busy={isLoading}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>
                {t('pages.dashboard.table.columns.name')}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t('pages.dashboard.table.columns.priority')}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t('pages.dashboard.table.columns.trend')}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t('pages.dashboard.table.columns.currentPrice')}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t('pages.dashboard.table.columns.priceChange', {
                  days: histWindowSize
                })}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="center">
                {t('pages.dashboard.table.columns.stock')}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="center">
                {t('pages.dashboard.table.columns.actions')}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <AnimatedList as="tbody">
            {isLoading ? (
              <SkeletonRows rows={5} columns={7} />
            ) : (
              products.map((product, index) => (
                <ProductTableRow
                  key={product.id}
                  product={product}
                  index={index}
                  locale={locale}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </AnimatedList>
        </Table.Root>
      </Table.ScrollArea>
    </Card.Root>
  );
};
