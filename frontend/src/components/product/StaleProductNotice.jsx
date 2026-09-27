import { Alert, Icon, Link } from '@chakra-ui/react';
import { LuExternalLink } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format';

/**
 * Product-page warning for a store whose price the backend reports as stale:
 * how long it has been, when the last price was recorded, the likely causes
 * (store down, product removed, agent blocked) and a link to check the store
 * page. Renders nothing when `days` is not a number.
 *
 * @param {object} props
 * @param {number|null|undefined} props.days - The offer's
 *   `days_since_check`, passed only for stale offers.
 * @param {number} props.lastCheckedAt - Unix seconds of the latest price
 *   record (`last_checked_at`).
 * @param {string} props.url - The store page.
 * @param {string} [props.storeName] - Named in the title for a product
 *   tracked in several stores (one notice per stale store).
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 */
export const StaleProductNotice = ({
  days,
  lastCheckedAt,
  url,
  storeName,
  locale
}) => {
  const { t } = useTranslation();

  if (typeof days !== 'number') return null;

  return (
    <Alert.Root status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {storeName
            ? t('pages.product.stale.titleStore', {
                store: storeName,
                count: days
              })
            : t('pages.product.stale.title', { count: days })}
        </Alert.Title>
        <Alert.Description>
          {t('pages.product.stale.description', {
            date: formatDate(lastCheckedAt, locale, 'long')
          })}{' '}
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            fontWeight="medium"
            textDecoration="underline"
          >
            {t('pages.product.stale.action')}
            <Icon as={LuExternalLink} size="xs" />
          </Link>
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
};
