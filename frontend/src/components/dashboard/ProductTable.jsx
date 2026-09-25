import { Card, Table, Text, VStack } from '@chakra-ui/react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { AnimatedList, AnimatedListItem } from '@/components/motion';
import { staggerStepSeconds } from '@/theme/motion';
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
import { useTableRowActivation } from './useRowActivation';

const ProductTableRow = ({ product, index, locale, onEdit, onDelete }) => {
  const activation = useTableRowActivation(`/product/${product.id}`);

  return (
    <AnimatedListItem
      as="tr"
      {...activation}
      delay={index * staggerStepSeconds}
      transitionProperty="background"
      transitionDuration="fast"
      transitionTimingFunction="easeOut"
      _hover={{ bg: 'bg.muted' }}
    >
      <Table.Cell>
        <VStack align="flex-start" gap={1}>
          <Link href={`/product/${product.id}`} asChild>
            <Text
              as="a"
              fontWeight="medium"
              color="fg"
              _hover={{ textDecoration: 'underline' }}
              focusVisibleRing="inside"
              focusRingWidth="2px"
              focusRingColor="fg"
            >
              {product.name}
            </Text>
          </Link>
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
 * trend sparkline, price, change, stock and a row actions menu. The
 * product name is a real link to the detail page (the keyboard and
 * screen-reader path, keeping the row's/cell's native table semantics
 * intact); clicking anywhere else on the row also navigates there, and
 * clicking inside the actions menu does not (see `ProductRowActions` and
 * `useTableRowActivation`).
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
    <Card.Root p={0} overflow="hidden" hideBelow="md">
      <Table.ScrollArea>
        <Table.Root size="md" variant="line">
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
          <AnimatedList as="tbody" aria-busy={isLoading}>
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
