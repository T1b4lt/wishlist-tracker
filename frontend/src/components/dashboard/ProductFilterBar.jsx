import { useMemo } from 'react';
import {
  Badge,
  Button,
  CloseButton,
  Flex,
  HStack,
  Icon,
  Input,
  InputGroup,
  Popover,
  Portal,
  Tag,
  Text,
  VStack,
  createListCollection
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { LuSearch, LuSlidersHorizontal } from 'react-icons/lu';
import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText
} from '@/components/ui/select';
import { SORT_KEYS, countActiveFilters } from '@/lib/productFilters';
import { ProductFilterPanel } from './ProductFilterPanel';

/**
 * Builds one removable chip per active filter value, each carrying the
 * patch that removes just that value.
 *
 * @returns {Array<{ key: string, label: string, patch: object }>}
 */
const buildChips = (filters, options, t, locale) => {
  const formatNumber = (value) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const chips = [];

  for (const id of filters.stores) {
    const store = options.stores.find((option) => option.id === id);
    chips.push({
      key: `store-${id}`,
      label: store?.name ?? `#${id}`,
      patch: { stores: filters.stores.filter((item) => item !== id) }
    });
  }
  for (const id of filters.categories) {
    const category = options.categories.find((option) => option.id === id);
    chips.push({
      key: `category-${id}`,
      label: category?.name ?? `#${id}`,
      patch: { categories: filters.categories.filter((item) => item !== id) }
    });
  }
  for (const priority of filters.priorities) {
    chips.push({
      key: `priority-${priority}`,
      label: t(`common.priority.${priority}`),
      patch: {
        priorities: filters.priorities.filter((item) => item !== priority)
      }
    });
  }
  if (filters.stock !== 'all') {
    chips.push({
      key: 'stock',
      label: t(`pages.dashboard.filters.stock.${filters.stock}`),
      patch: { stock: 'all' }
    });
  }
  const { minPrice, maxPrice } = filters;
  if (minPrice !== null || maxPrice !== null) {
    const label =
      minPrice !== null && maxPrice !== null
        ? t('pages.dashboard.filters.price.range', {
            min: formatNumber(minPrice),
            max: formatNumber(maxPrice)
          })
        : minPrice !== null
          ? t('pages.dashboard.filters.price.atLeast', {
              value: formatNumber(minPrice)
            })
          : t('pages.dashboard.filters.price.atMost', {
              value: formatNumber(maxPrice)
            });
    chips.push({
      key: 'price',
      label,
      patch: { minPrice: null, maxPrice: null }
    });
  }
  if (filters.priceDrop) {
    chips.push({
      key: 'priceDrop',
      label: t('pages.dashboard.filters.deals.priceDrop'),
      patch: { priceDrop: false }
    });
  }
  if (filters.atLowest) {
    chips.push({
      key: 'atLowest',
      label: t('pages.dashboard.filters.deals.atLowest'),
      patch: { atLowest: false }
    });
  }
  return chips;
};

/**
 * The dashboard's search and filter bar: a live search box, a sort select,
 * a "Filters" popover (`ProductFilterPanel`), a row of removable chips for
 * the active filters and a "Showing X of Y" count. Fully controlled: it
 * never holds filter state itself, only reports partial patches.
 *
 * @param {object} props
 * @param {import('@/lib/productFilters').ProductFilters} props.filters
 * @param {ReturnType<typeof import('@/lib/productFilters').getFilterOptions>} props.options
 * @param {number} props.shownCount - Products left after filtering.
 * @param {number} props.totalCount - All products.
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 * @param {(patch: Partial<import('@/lib/productFilters').ProductFilters>) => void} props.onChange
 * @param {() => void} props.onReset - Clears every filter (and the query).
 */
export const ProductFilterBar = ({
  filters,
  options,
  shownCount,
  totalCount,
  locale,
  onChange,
  onReset
}) => {
  const { t } = useTranslation();

  const sortCollection = useMemo(
    () =>
      createListCollection({
        items: SORT_KEYS.map((value) => ({
          value,
          label: t(`pages.dashboard.filters.sort.${value}`)
        }))
      }),
    [t]
  );

  const activeCount = countActiveFilters(filters);
  const chips = buildChips(filters, options, t, locale);

  return (
    <VStack align="stretch" gap={3} mb={{ base: 4, md: 6 }}>
      <Flex gap={2} wrap={{ base: 'wrap', md: 'nowrap' }}>
        <InputGroup
          flex="1"
          minW={{ base: 'full', md: '0' }}
          startElement={<Icon as={LuSearch} color="fg.muted" />}
          endElement={
            filters.query ? (
              <CloseButton
                size="xs"
                variant="plain"
                aria-label={t('pages.dashboard.filters.clearSearch')}
                onClick={() => onChange({ query: '' })}
              />
            ) : undefined
          }
        >
          <Input
            type="search"
            aria-label={t('pages.dashboard.filters.searchLabel')}
            placeholder={t('pages.dashboard.filters.searchPlaceholder')}
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
            autoComplete="off"
          />
        </InputGroup>

        <SelectRoot
          collection={sortCollection}
          value={[filters.sort]}
          onValueChange={(details) => {
            const sort = details.value[0];
            if (sort) onChange({ sort });
          }}
          flex={{ base: '1', md: 'none' }}
          w={{ md: '220px' }}
        >
          <SelectLabel srOnly>
            {t('pages.dashboard.filters.sortLabel')}
          </SelectLabel>
          <SelectTrigger>
            <SelectValueText />
          </SelectTrigger>
          <SelectContent>
            {sortCollection.items.map((item) => (
              <SelectItem key={item.value} item={item}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>

        <Popover.Root positioning={{ placement: 'bottom-end' }}>
          <Popover.Trigger asChild>
            <Button variant="outline">
              <Icon as={LuSlidersHorizontal} />
              {t('pages.dashboard.filters.button')}
              {activeCount > 0 && (
                <Badge variant="solid" size="sm" borderRadius="full">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content
                w="min(22rem, calc(100vw - 2rem))"
                maxH="min(36rem, calc(100dvh - 8rem))"
                overflowY="auto"
              >
                <Popover.Header>
                  <Popover.Title fontWeight="semibold">
                    {t('pages.dashboard.filters.panelTitle')}
                  </Popover.Title>
                </Popover.Header>
                <Popover.Body>
                  <ProductFilterPanel
                    filters={filters}
                    options={options}
                    onChange={onChange}
                  />
                </Popover.Body>
                <Popover.CloseTrigger asChild>
                  <CloseButton size="sm" position="absolute" top={2} end={2} />
                </Popover.CloseTrigger>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
      </Flex>

      <Flex gap={3} align="center" justify="space-between" wrap="wrap" minH={8}>
        <HStack gap={2} wrap="wrap">
          {chips.map((chip) => (
            <Tag.Root
              key={chip.key}
              size="md"
              variant="subtle"
              colorPalette="gray"
            >
              <Tag.Label>{chip.label}</Tag.Label>
              <Tag.EndElement>
                <Tag.CloseTrigger
                  aria-label={t('pages.dashboard.filters.removeFilter', {
                    label: chip.label
                  })}
                  onClick={() => onChange(chip.patch)}
                />
              </Tag.EndElement>
            </Tag.Root>
          ))}
          {chips.length > 0 && (
            <Button variant="ghost" size="xs" onClick={onReset}>
              {t('pages.dashboard.filters.clearAll')}
            </Button>
          )}
        </HStack>
        <Text textStyle="caption" color="fg.muted" aria-live="polite">
          {t('pages.dashboard.filters.resultCount', {
            shown: shownCount,
            count: totalCount
          })}
        </Text>
      </Flex>
    </VStack>
  );
};
