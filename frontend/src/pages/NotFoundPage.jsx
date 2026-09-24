import { useLocation } from 'wouter';
import { Box, Button, Heading, Text, VStack } from '@chakra-ui/react';
import { LuHouse } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/layout/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const NotFoundPage = () => {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  useDocumentTitle(t('pages.notFound.title'));

  return (
    <PageContainer>
      <PageHeader title={t('pages.notFound.title')} />
      <VStack gap={8} textAlign="center">
        {/* Error Code */}
        <Heading textStyle="display" color="fg">
          404
        </Heading>

        {/* Funny Messages */}
        <Box p={6} borderRadius="lg" bg="bg.muted" maxW="md">
          <Text fontSize="md" color="fg" fontStyle="italic">
            {t('pages.notFound.quote')}
          </Text>
        </Box>

        {/* Action Buttons */}
        <VStack gap={3} pt={4}>
          <Button size="lg" onClick={() => navigate('/')}>
            <LuHouse /> {t('pages.notFound.actionPrimary')}
          </Button>
          <Text fontSize="sm" color="fg.subtle">
            {t('pages.notFound.actionSecondary')}
          </Text>
        </VStack>
      </VStack>
    </PageContainer>
  );
};

export default NotFoundPage;
