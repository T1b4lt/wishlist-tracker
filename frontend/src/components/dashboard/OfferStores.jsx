import { Badge, HStack, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { StoreBadge } from '@/components/common';
import { Tooltip } from '@/components/ui/tooltip';
import { findBestOfferSummary } from '@/lib/bestOffer';
import { formatPrice } from '@/lib/format';

/**
 * A dashboard product's stores: the best offer's store badge and, when the
 * product is tracked in more stores, a "+N" chip whose tooltip lists every
 * store with its price and stock (the best one marked). The chip is
 * focusable, so the list is reachable from the keyboard too.
 *
 * @param {object} props
 * @param {{ best_offer_id: number|null, currency: string, offers: object[] }} props.product
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 */
export const OfferStores = ({ product, locale }) => {
  const { t } = useTranslation();
  const best = findBestOfferSummary(product);
  const extraCount = product.offers.length - 1;

  if (!best) return null;

  return (
    <HStack gap={1.5} minW={0}>
      <StoreBadge
        storeId={best.store_id}
        name={best.store_name}
        hasFavicon={best.store_has_favicon}
      />
      {extraCount > 0 && (
        <Tooltip
          showArrow
          content={
            <VStack align="stretch" gap={1}>
              {product.offers.map((offer) => (
                <HStack key={offer.id} justify="space-between" gap={4}>
                  <Text>{offer.store_name}</Text>
                  <Text textStyle="numeric">
                    {offer.current_price === null
                      ? t('pages.dashboard.offers.notChecked')
                      : formatPrice(
                          offer.current_price,
                          product.currency,
                          locale
                        )}
                    {offer.is_in_stock === false &&
                      ` · ${t('common.status.outOfStock')}`}
                    {offer.id === product.best_offer_id &&
                      ` · ${t('pages.dashboard.offers.bestPrice')}`}
                  </Text>
                </HStack>
              ))}
            </VStack>
          }
        >
          <Badge
            as="button"
            type="button"
            variant="subtle"
            size="sm"
            aria-label={t('pages.dashboard.offers.moreStores', {
              count: extraCount
            })}
            onClick={(event) => event.stopPropagation()}
          >
            {t('pages.dashboard.offers.moreStoresShort', { count: extraCount })}
          </Badge>
        </Tooltip>
      )}
    </HStack>
  );
};
