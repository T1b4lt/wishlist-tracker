import { Button } from '@chakra-ui/react';
import { Link } from 'wouter';
import { LuSearchX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/layout/PageContainer';
import { EmptyState } from '@/components/common';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * The catch-all 404 route: an `EmptyState` (icon, title, plain description)
 * with a single action back to the dashboard. No page header, no gradient
 * text, no emoji and no quote box, per the spec's plain-copy requirement.
 */
const NotFoundPage = () => {
  const { t } = useTranslation();
  useDocumentTitle(t('pages.notFound.title'));

  return (
    <PageContainer>
      <EmptyState
        icon={LuSearchX}
        title={t('pages.notFound.title')}
        description={t('pages.notFound.message')}
        action={
          <Link href="/" asChild>
            <Button as="a">{t('common.actions.backToWishlist')}</Button>
          </Link>
        }
      />
    </PageContainer>
  );
};

export default NotFoundPage;
