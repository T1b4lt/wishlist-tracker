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
import { useColorMode } from '@/components/ui/color-mode';
import { useTranslation } from 'react-i18next';

const NotFoundPage = () => {
  const [, navigate] = useLocation();
  const { colorMode } = useColorMode();
  const { t } = useTranslation();

  return (
    <Container maxW="container.md" py={20}>
      <VStack gap={8} textAlign="center">
        {/* Error Code */}
        <Heading
          size="4xl"
          bgGradient="to-r"
          gradientFrom={colorMode === 'light' ? 'red.400' : 'red.300'}
          gradientTo={colorMode === 'light' ? 'pink.600' : 'pink.400'}
          backgroundClip="text"
        >
          404
        </Heading>

        {/* Main Message */}
        <Heading size="xl">{t('pages.notFound.title')}</Heading>

        {/* Funny Messages */}
        <Box
          p={6}
          borderRadius="lg"
          bg={colorMode === 'light' ? 'gray.50' : 'gray.800'}
          maxW="md"
        >
          <Text
            fontSize="md"
            color={colorMode === 'light' ? 'gray.700' : 'gray.300'}
            fontStyle="italic"
          >
            {t('pages.notFound.quote')}
          </Text>
        </Box>

        {/* Action Buttons */}
        <VStack gap={3} pt={4}>
          <Button size="lg" onClick={() => navigate('/')}>
            <LuHouse /> {t('pages.notFound.actionPrimary')}
          </Button>
          <Text
            fontSize="sm"
            color={colorMode === 'light' ? 'gray.500' : 'gray.500'}
          >
            {t('pages.notFound.actionSecondary')}
          </Text>
        </VStack>
      </VStack>
    </Container>
  );
};

export default NotFoundPage;
