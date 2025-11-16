import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Input,
  Text,
  VStack,
  Flex,
  createListCollection
} from '@chakra-ui/react';
import { LuSave, LuTrendingDown, LuPackage } from 'react-icons/lu';
import { useColorMode } from '@/components/ui/color-mode';
import { toaster } from '@/components/ui/toaster';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Field } from '@/components/ui/field';

const API_URL = 'http://localhost:8000';

// Create collections for selects
const languageCollection = createListCollection({
  items: [
    { label: 'English', value: 'english' },
    { label: 'Spanish', value: 'spanish' }
  ]
});

const hourCollection = createListCollection({
  items: Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, '0')}:00`,
    value: i.toString()
  }))
});

const SettingsPage = () => {
  const { colorMode } = useColorMode();
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Configuration states
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [analysisHour, setAnalysisHour] = useState(12);
  const [telegramBotString, setTelegramBotString] = useState('');
  const [isPriceDropAlert, setIsPriceDropAlert] = useState(false);
  const [isStockChangeAlert, setIsStockChangeAlert] = useState(false);

  // Original values to track changes
  const [originalConfig, setOriginalConfig] = useState({});

  // Fetch configuration
  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/config/`);
      if (!response.ok) throw new Error('Failed to fetch configuration');

      const data = await response.json();

      // Set all values
      setSelectedLanguage(data.selected_language);
      setAnalysisHour(data.analysys_hour);
      setTelegramBotString(data.telegram_bot_connection_string || '');
      setIsPriceDropAlert(data.is_price_drop_alert);
      setIsStockChangeAlert(data.is_stock_change_alert);

      // Store original values
      setOriginalConfig(data);
    } catch (error) {
      console.error('Error fetching configuration:', error);
      toaster.create({
        title: 'Error loading settings',
        description: 'Failed to load settings. Please try again.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Check if there are changes
  useEffect(() => {
    if (!originalConfig.selected_language) return; // Wait for original config to load

    const changed =
      selectedLanguage !== originalConfig.selected_language ||
      analysisHour !== originalConfig.analysys_hour ||
      telegramBotString !==
        (originalConfig.telegram_bot_connection_string || '') ||
      isPriceDropAlert !== originalConfig.is_price_drop_alert ||
      isStockChangeAlert !== originalConfig.is_stock_change_alert;

    setHasChanges(changed);
  }, [
    selectedLanguage,
    analysisHour,
    telegramBotString,
    isPriceDropAlert,
    isStockChangeAlert,
    originalConfig
  ]);

  // Save configuration
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/config/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_language: selectedLanguage,
          analysys_hour: analysisHour,
          telegram_bot_connection_string: telegramBotString || null,
          is_price_drop_alert: isPriceDropAlert,
          is_stock_change_alert: isStockChangeAlert
        })
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      const data = await response.json();
      setOriginalConfig(data);
      setHasChanges(false);

      toaster.create({
        title: 'Settings saved',
        description: 'Your settings have been saved successfully.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error saving configuration:', error);
      toaster.create({
        title: 'Error saving settings',
        description: 'Failed to save settings. Please try again.',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxW="container.xl" py={8}>
        <Text>Loading settings...</Text>
      </Container>
    );
  }

  return (
    <Container maxW="container.lg" py={8}>
      <VStack gap={8} align="stretch">
        {/* Header */}
        <Box>
          <Heading size="2xl" mb={2}>
            Settings
          </Heading>
          <Text color={colorMode === 'light' ? 'gray.600' : 'gray.400'}>
            Configure your application preferences
          </Text>
        </Box>

        {/* General Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.900'}
        >
          <Heading size="lg" mb={4}>
            General
          </Heading>

          <Field label="Language" mb={4}>
            <SelectRoot
              collection={languageCollection}
              value={[selectedLanguage]}
              onValueChange={(details) => setSelectedLanguage(details.value[0])}
              size="md"
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {languageCollection.items.map((item) => (
                  <SelectItem key={item.value} item={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>
        </Box>

        {/* Analysis Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.900'}
        >
          <Heading size="lg" mb={4}>
            Analysis
          </Heading>

          <Field
            label="Analysis Hour"
            helperText="The hour of the day (0-23) when the daily analysis will run"
          >
            <SelectRoot
              collection={hourCollection}
              value={[analysisHour.toString()]}
              onValueChange={(details) =>
                setAnalysisHour(parseInt(details.value[0]))
              }
              size="md"
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select hour" />
              </SelectTrigger>
              <SelectContent>
                {hourCollection.items.map((item) => (
                  <SelectItem key={item.value} item={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>
        </Box>

        {/* Notifications Section */}
        <Box
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          bg={colorMode === 'light' ? 'white' : 'gray.900'}
        >
          <Heading size="lg" mb={4}>
            Notifications
          </Heading>

          <VStack gap={6} align="stretch">
            <Field
              label="Telegram Bot Token"
              helperText="Enter your Telegram bot token to receive notifications"
            >
              <Input
                value={telegramBotString}
                onChange={(e) => setTelegramBotString(e.target.value)}
                placeholder="Enter your Telegram bot token"
              />
            </Field>

            {/* Price Drop Alerts */}
            <Flex
              align="center"
              justify="space-between"
              p={4}
              borderRadius="md"
              _hover={{
                bg: colorMode === 'light' ? 'gray.50' : 'gray.800'
              }}
              transition="all 0.2s"
              opacity={!telegramBotString ? 0.5 : 1}
            >
              <Flex align="center" gap={4} flex={1}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={colorMode === 'light' ? 'blue.50' : 'blue.900'}
                  color={colorMode === 'light' ? 'blue.600' : 'blue.300'}
                >
                  <LuTrendingDown size={20} />
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    Price Drop Alerts
                  </Text>
                  <Text
                    fontSize="sm"
                    color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                  >
                    {!telegramBotString
                      ? 'Configure a Telegram bot token first'
                      : 'Receive notifications when product prices drop'}
                  </Text>
                </Box>
              </Flex>
              <Switch
                size="lg"
                checked={isPriceDropAlert}
                onCheckedChange={(e) => setIsPriceDropAlert(e.checked)}
                disabled={!telegramBotString}
              />
            </Flex>

            {/* Stock Change Alerts */}
            <Flex
              align="center"
              justify="space-between"
              p={4}
              borderRadius="md"
              _hover={{
                bg: colorMode === 'light' ? 'gray.50' : 'gray.800'
              }}
              transition="all 0.2s"
              opacity={!telegramBotString ? 0.5 : 1}
            >
              <Flex align="center" gap={4} flex={1}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={colorMode === 'light' ? 'green.50' : 'green.900'}
                  color={colorMode === 'light' ? 'green.600' : 'green.300'}
                >
                  <LuPackage size={20} />
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    Stock Change Alerts
                  </Text>
                  <Text
                    fontSize="sm"
                    color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
                  >
                    {!telegramBotString
                      ? 'Configure a Telegram bot token first'
                      : 'Receive notifications when product stock status changes'}
                  </Text>
                </Box>
              </Flex>
              <Switch
                size="lg"
                checked={isStockChangeAlert}
                onCheckedChange={(e) => setIsStockChangeAlert(e.checked)}
                disabled={!telegramBotString}
              />
            </Flex>
          </VStack>
        </Box>

        {/* Save Button */}
        <Flex justify="flex-end">
          <Button
            size="lg"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            loading={isSaving}
          >
            <LuSave /> Save
          </Button>
        </Flex>
      </VStack>
    </Container>
  );
};

export default SettingsPage;
