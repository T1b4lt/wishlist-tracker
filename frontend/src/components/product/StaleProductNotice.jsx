import { Alert, Icon, Link } from '@chakra-ui/react';
import { LuExternalLink } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format';
import {
  STALE_AFTER_DAYS,
  daysSinceCheck,
  nowInSeconds
} from '@/lib/staleness';

/**
 * Product-page warning for a product whose price has not been updated for
 * `STALE_AFTER_DAYS` days or more (see `lib/staleness.js`): how long it has
 * been, when the last price was recorded, the likely causes (store down,
 * product removed, agent blocked) and a link to check the store page.
 * Renders nothing while the price is up to date or when the product was
 * never checked.
 *
 * @param {object} props
 * @param {number|null|undefined} props.lastCheckedAt - Unix seconds of the
 *   latest price record (`last_checked_at`).
 * @param {string} props.url - The store page.
 * @param {string} [props.storeName] - Named in the title for a product
 *   tracked in several stores (one notice per stale store).
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 * @param {number} [props.now] - Reference Unix time in seconds; defaults to
 *   now (set in tests for deterministic output).
 */
export const StaleProductNotice = ({
  lastCheckedAt,
  url,
  storeName,
  locale,
  now = nowInSeconds()
}) => {
  const { t } = useTranslation();
  const days = daysSinceCheck(lastCheckedAt, now);

  if (days === null || days < STALE_AFTER_DAYS) return null;

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
