import { Box, Card, Flex, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { AnimatedList, AnimatedListItem } from '@/components/motion';
import { staggerStepSeconds } from '@/theme/motion';
import {
  SkeletonCards,
  CategoryTag,
  PriceChange,
  StockStatus
} from '@/components/common';
import { formatPrice } from '@/lib/format';
import { ProductRowActions } from './ProductRowActions';
import { useRowActivation } from './useRowActivation';

const ProductCard = ({ product, index, locale, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const activation = useRowActivation(`/product/${product.id}`);

  return (
    <AnimatedListItem as="li" delay={index * staggerStepSeconds}>
      <Card.Root
        {...activation}
        aria-label={t('pages.dashboard.aria.openProduct', {
          name: product.name
        })}
        p={4}
        transitionProperty="background"
        transitionDuration="fast"
        transitionTimingFunction="easeOut"
        _hover={{ bg: 'bg.muted' }}
        focusVisibleRing="inside"
        focusRingWidth="2px"
        focusRingColor="fg"
      >
        <Flex justify="space-between" align="flex-start" gap={3}>
          <VStack align="flex-start" gap={1.5} flex={1} minW={0}>
            <Text fontWeight="medium" color="fg">
              {product.name}
            </Text>
            <CategoryTag
              name={product.category_name}
              color={product.category_color}
            />
            <Flex align="baseline" gap={2} wrap="wrap">
              <Text textStyle="numeric" fontWeight="medium">
                {formatPrice(product.current_price, product.currency, locale)}
              </Text>
              <PriceChange value={product.price_change_60d} locale={locale} />
            </Flex>
            <StockStatus inStock={product.is_in_stock} />
          </VStack>
          <ProductRowActions
            product={product}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </Flex>
      </Card.Root>
    </AnimatedListItem>
  );
};

/**
 * The `<md` product list: a card per product (name + category, price with
 * change, stock, actions menu). Tapping/clicking a card, or pressing Enter
 * while it is focused, opens the product's detail page; clicks inside the
 * actions menu do not (see `ProductRowActions`).
 *
 * @param {object} props
 * @param {object[]} props.products - Dashboard summary rows.
 * @param {boolean} props.isLoading
 * @param {string} props.locale
 * @param {(product: object) => void} props.onEdit
 * @param {(product: object) => void} props.onDelete
 */
export const ProductCardList = ({
  products,
  isLoading,
  locale,
  onEdit,
  onDelete
}) => {
  if (isLoading) {
    // `SkeletonCards` does not forward extra props to its `SimpleGrid`, so
    // the `md+` hiding has to wrap it instead of being passed through.
    return (
      <Box hideFrom="md">
        <SkeletonCards count={4} columns={{ base: 1 }} />
      </Box>
    );
  }

  return (
    <AnimatedList
      as="ul"
      hideFrom="md"
      listStyleType="none"
      display="flex"
      flexDirection="column"
      gap={3}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          index={index}
          locale={locale}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </AnimatedList>
  );
};
