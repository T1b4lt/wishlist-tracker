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
  createListCollection,
  HStack,
  Stack
} from '@chakra-ui/react';
import {
  LuSave,
  LuTrendingDown,
  LuPackage,
  LuDownload,
  LuSend
} from 'react-icons/lu';
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
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger
} from '@/components/ui/dialog';

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
  const [telegramBotChatId, setTelegramBotChatId] = useState('');
  const [isPriceDropAlert, setIsPriceDropAlert] = useState(false);
  const [isStockChangeAlert, setIsStockChangeAlert] = useState(false);

  // Original values to track changes
  const [originalConfig, setOriginalConfig] = useState({});

  // UI states for Telegram functionality
  const [isGettingChatId, setIsGettingChatId] = useState(false);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [showStartBotModal, setShowStartBotModal] = useState(false);

  // Fetch configuration
  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/config/`);
      if (!response.ok) throw new Error('Failed to fetch configuration');

      const data = await response.json();

      // Set all values
      setSelectedLanguage(data.selected_language);
      setAnalysisHour(data.analysys_hour);
      setTelegramBotString(data.telegram_bot_token || '');
      setTelegramBotChatId(data.telegram_bot_chat_id || '');
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
      telegramBotString !== (originalConfig.telegram_bot_token || '') ||
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

  // Get Telegram Chat ID
  const handleGetChatId = async () => {
    setIsGettingChatId(true);
    try {
      const response = await fetch(`${API_URL}/telegram-chat-id`);

      if (response.status === 400) {
        toaster.create({
          title: 'Bot token not configured',
          description:
            'Please save the bot token first before getting the chat ID.',
          type: 'error'
        });
        return;
      }

      if (response.status === 404) {
        setShowStartBotModal(true);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to get chat ID');
      }

      // Refresh config to get the saved chat_id
      await fetchConfig();

      toaster.create({
        title: 'Chat ID saved',
        description: 'Your Telegram chat ID has been saved successfully.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error getting chat ID:', error);
      toaster.create({
        title: 'Error getting chat ID',
        description: 'Failed to retrieve chat ID. Please try again.',
        type: 'error'
      });
    } finally {
      setIsGettingChatId(false);
    }
  };

  // Send test message
  const handleSendTestMessage = async () => {
    setIsSendingTestMessage(true);
    try {
      const response = await fetch(`${API_URL}/telegram-test-message`, {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to send test message');
      }

      toaster.create({
        title: 'Test message sent',
        description: 'Check your Telegram for the test message!',
        type: 'success'
      });
    } catch (error) {
      console.error('Error sending test message:', error);
      toaster.create({
        title: 'Error sending test message',
        description:
          error.message || 'Failed to send test message. Please try again.',
        type: 'error'
      });
    } finally {
      setIsSendingTestMessage(false);
    }
  };

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
          telegram_bot_token: telegramBotString || null,
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
            <Stack gap={4} align="flex-start" direction={{ base: 'column', md: 'row' }}>
              <Field
                label="Telegram Bot Token"
                helperText="Create a bot with @BotFather on Telegram and paste the token here"
                flex={1}
              >
                <HStack gap={2}>
                  <Input
                    value={telegramBotString}
                    onChange={(e) => setTelegramBotString(e.target.value)}
                    placeholder="Enter your Telegram bot token"
                    flex={1}
                  />
                  {telegramBotString && (
                    <Button
                      onClick={handleGetChatId}
                      loading={isGettingChatId}
                      disabled={isGettingChatId}
                      size="md"
                    >
                      <LuDownload /> Get Chat ID
                    </Button>
                  )}
                </HStack>
              </Field>

              {telegramBotChatId && (
                <Field
                  label="Telegram Chat ID"
                  helperText="This is your unique chat ID for receiving notifications"
                  flex={1}
                >
                  <HStack gap={2}>
                    <Input value={telegramBotChatId} disabled flex={1} />
                    <Button
                      onClick={handleSendTestMessage}
                      loading={isSendingTestMessage}
                      disabled={isSendingTestMessage}
                      size="md"
                      colorScheme="blue"
                    >
                      <LuSend /> Test Bot
                    </Button>
                  </HStack>
                </Field>
              )}
            </Stack>

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

      {/* Start Bot Modal */}
      <DialogRoot
        open={showStartBotModal}
        onOpenChange={(e) => setShowStartBotModal(e.open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start your Telegram bot</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <VStack gap={4} align="stretch">
              <Text>
                No chat ID was found. To connect your Telegram bot, please
                follow these steps:
              </Text>
              <Box
                p={4}
                borderRadius="md"
                bg={colorMode === 'light' ? 'gray.50' : 'gray.800'}
              >
                <Text fontWeight="medium" mb={2}>
                  Steps:
                </Text>
                <VStack align="stretch" gap={2}>
                  <Text>1. Open Telegram and search for your bot</Text>
                  <Text>
                    2. Send the command <strong>/start</strong> to the bot
                  </Text>
                  <Text>3. Come back here and click "Get Chat ID" again</Text>
                </VStack>
              </Box>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setShowStartBotModal(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Container>
  );
};

export default SettingsPage;
