import { useLocation } from 'wouter';
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack
} from '@chakra-ui/react';
import { LuHouse } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';

const NotFoundPage = () => {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  return (
    <Container maxW="container.md" py={20}>
      <VStack gap={8} textAlign="center">
        {/* Error Code */}
        <Heading size="4xl" color="fg">
          404
        </Heading>

        {/* Main Message */}
        <Heading size="xl">{t('pages.notFound.title')}</Heading>

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
    </Container>
  );
};

export default NotFoundPage;
