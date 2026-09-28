import { useRef } from 'react';
import {
  Badge,
  Box,
  Card,
  Heading,
  HStack,
  Icon,
  IconButton,
  List,
  Menu,
  Portal,
  Text,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  LuEllipsis,
  LuExternalLink,
  LuPencil,
  LuRefreshCw,
  LuSplit,
  LuTrash2
} from 'react-icons/lu';
import { StockStatus, StoreBadge } from '@/components/common';
import { formatPrice, formatRelative } from '@/lib/format';

const OfferRow = ({
  offer,
  currency,
  isBest,
  isOnly,
  locale,
  isChecking,
  onCheck,
  onEdit,
  onUnlink,
  onRemove
}) => {
  const { t } = useTranslation();
  const triggerRef = useRef(null);
  const checkLabel = t('pages.product.offers.checkNow', {
    store: offer.store_name
  });

  return (
    <List.Item
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={4}
      py={3}
      borderBottomWidth="1px"
      _last={{ borderBottomWidth: 0 }}
    >
      <VStack align="flex-start" gap={1} minW={0}>
        <HStack gap={2} wrap="wrap">
          <StoreBadge
            storeId={offer.store_id}
            name={offer.store_name}
            hasFavicon={offer.store_has_favicon}
            size="md"
          />
          {isBest && (
            <Badge colorPalette="green" variant="subtle">
              {t('pages.product.offers.bestPrice')}
            </Badge>
          )}
        </HStack>
        <Text textStyle="caption" color="fg.muted">
          {offer.last_checked_at
            ? t('pages.product.offers.lastChecked', {
                time: formatRelative(offer.last_checked_at, locale)
              })
            : t('pages.product.offers.notChecked')}
        </Text>
      </VStack>
      <HStack gap={4}>
        <VStack align="flex-end" gap={0.5}>
          <Text textStyle="numeric" fontWeight="semibold">
            {offer.current_price === null
              ? '-'
              : formatPrice(offer.current_price, currency, locale)}
          </Text>
          {offer.is_in_stock !== null && (
            <StockStatus inStock={offer.is_in_stock} />
          )}
        </VStack>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={checkLabel}
          title={checkLabel}
          loading={isChecking}
          disabled={isChecking}
          onClick={() => onCheck(offer)}
        >
          <Icon as={LuRefreshCw} />
        </IconButton>
        <Menu.Root positioning={{ placement: 'bottom-end' }}>
          <Menu.Trigger asChild>
            <IconButton
              ref={triggerRef}
              variant="ghost"
              size="sm"
              aria-label={t('pages.product.offers.rowActions', {
                store: offer.store_name
              })}
            >
              <Icon as={LuEllipsis} />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item
                  value="open"
                  onSelect={() =>
                    window.open(offer.url, '_blank', 'noopener,noreferrer')
                  }
                >
                  <Icon as={LuExternalLink} />
                  {t('pages.product.offers.open')}
                </Menu.Item>
                <Menu.Item
                  value="edit"
                  onSelect={() => onEdit(offer, triggerRef.current)}
                >
                  <Icon as={LuPencil} />
                  {t('pages.product.offers.editUrl')}
                </Menu.Item>
                <Menu.Item
                  value="unlink"
                  disabled={isOnly}
                  onSelect={() => onUnlink(offer)}
                >
                  <Icon as={LuSplit} />
                  {t('pages.product.offers.unlink')}
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  value="remove"
                  disabled={isOnly}
                  onSelect={() => onRemove(offer, triggerRef.current)}
                >
                  <Icon as={LuTrash2} />
                  {t('pages.product.offers.remove')}
                </Menu.Item>
                {isOnly && (
                  <Box px={2} py={1}>
                    <Text textStyle="caption" color="fg.muted">
                      {t('pages.product.offers.onlyStoreHint')}
                    </Text>
                  </Box>
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
    </List.Item>
  );
};

/**
 * The product page's "Stores" card: one row per offer with its store,
 * price, stock, last check and, with several stores, a "Best price"
 * marker, a button to check its price now (replacing today's record) and a
 * menu to open the store page, edit the URL, unlink the store into its own
 * product or remove it. Unlink and remove are disabled on a product's only
 * store.
 *
 * @param {object} props
 * @param {object[]} props.offers - `OfferDetail` records.
 * @param {string} props.currency
 * @param {number|null} props.bestOfferId
 * @param {string} props.locale
 * @param {Set<number>} [props.checkingOfferIds] - Offers whose price check is in progress.
 * @param {(offer: object) => void} props.onCheck
 * @param {(offer: object, triggerEl: HTMLElement|null) => void} props.onEdit
 * @param {(offer: object) => void} props.onUnlink
 * @param {(offer: object, triggerEl: HTMLElement|null) => void} props.onRemove
 * @param {import('react').ReactNode} [props.actions] - Rendered in the card header (e.g. "Add store").
 */
export const OfferList = ({
  offers,
  currency,
  bestOfferId,
  locale,
  checkingOfferIds,
  onCheck,
  onEdit,
  onUnlink,
  onRemove,
  actions
}) => {
  const { t } = useTranslation();

  return (
    <Card.Root>
      <Card.Body>
        <HStack justify="space-between" mb={2}>
          <Heading textStyle="heading.sm">
            {t('pages.product.offers.title')}
          </Heading>
          {actions}
        </HStack>
        <List.Root variant="plain">
          {offers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              currency={currency}
              isBest={offers.length > 1 && offer.id === bestOfferId}
              isOnly={offers.length === 1}
              locale={locale}
              isChecking={checkingOfferIds?.has(offer.id) ?? false}
              onCheck={onCheck}
              onEdit={onEdit}
              onUnlink={onUnlink}
              onRemove={onRemove}
            />
          ))}
        </List.Root>
      </Card.Body>
    </Card.Root>
  );
};
