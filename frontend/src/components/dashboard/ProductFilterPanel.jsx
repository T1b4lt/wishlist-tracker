import { useState } from 'react';
import {
  Checkbox,
  Circle,
  HStack,
  Input,
  Stack,
  Text,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PRIORITIES, STOCK_FILTERS } from '@/lib/productFilters';

/**
 * Parses a user-typed price, accepting a comma as the decimal separator.
 * @param {string} text
 * @returns {number|null|undefined} `null` for an empty field, `undefined`
 *   for text that is not (yet) a valid non-negative number.
 */
const parsePriceInput = (text) => {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

/**
 * A price bound input. Keeps its own text so an in-progress value like
 * "10." or "99," stays editable (the filters only hold numbers), and only
 * reports a change once the text parses to a valid price or is emptied.
 */
const PriceInput = ({ label, value, onChange }) => {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);

  // Re-sync when the value changes from outside (e.g. a dismissed chip or
  // "Clear all"), without clobbering text that already means this value.
  if (value !== lastValue) {
    setLastValue(value);
    if (parsePriceInput(text) !== value) {
      setText(value === null ? '' : String(value));
    }
  }

  return (
    <Input
      size="sm"
      inputMode="decimal"
      aria-label={label}
      placeholder={label}
      value={text}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);
        const parsed = parsePriceInput(nextText);
        if (parsed !== undefined && parsed !== value) {
          setLastValue(parsed);
          onChange(parsed);
        }
      }}
    />
  );
};

const FilterCheckbox = ({ checked, onCheckedChange, children }) => (
  <Checkbox.Root
    size="sm"
    checked={checked}
    onCheckedChange={(details) => onCheckedChange(details.checked === true)}
  >
    <Checkbox.HiddenInput />
    <Checkbox.Control />
    <Checkbox.Label>{children}</Checkbox.Label>
  </Checkbox.Root>
);

const Section = ({ label, children }) => (
  <VStack align="stretch" gap={2}>
    <Text textStyle="caption" color="fg.muted">
      {label}
    </Text>
    {children}
  </VStack>
);

/** Adds `value` to `list`, or removes it if it is already there. */
const toggle = (list, value) =>
  list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];

/**
 * The dashboard's filter panel: stock, price range, deal toggles, stores,
 * categories and priorities. Every change is reported immediately as a
 * partial filters patch, so the list updates live behind the panel.
 *
 * @param {object} props
 * @param {import('@/lib/productFilters').ProductFilters} props.filters
 * @param {ReturnType<typeof import('@/lib/productFilters').getFilterOptions>} props.options
 * @param {(patch: Partial<import('@/lib/productFilters').ProductFilters>) => void} props.onChange
 */
export const ProductFilterPanel = ({ filters, options, onChange }) => {
  const { t } = useTranslation();

  return (
    <VStack align="stretch" gap={5}>
      <Section label={t('pages.dashboard.filters.stock.label')}>
        <SegmentedControl
          size="sm"
          items={STOCK_FILTERS.map((value) => ({
            value,
            label: t(`pages.dashboard.filters.stock.${value}`)
          }))}
          value={filters.stock}
          onValueChange={(details) => onChange({ stock: details.value })}
        />
      </Section>

      <Section label={t('pages.dashboard.filters.price.label')}>
        <HStack gap={2}>
          <PriceInput
            label={t('pages.dashboard.filters.price.min')}
            value={filters.minPrice}
            onChange={(minPrice) => onChange({ minPrice })}
          />
          <Text color="fg.muted">-</Text>
          <PriceInput
            label={t('pages.dashboard.filters.price.max')}
            value={filters.maxPrice}
            onChange={(maxPrice) => onChange({ maxPrice })}
          />
        </HStack>
      </Section>

      <Section label={t('pages.dashboard.filters.deals.label')}>
        <FilterCheckbox
          checked={filters.priceDrop}
          onCheckedChange={(priceDrop) => onChange({ priceDrop })}
        >
          {t('pages.dashboard.filters.deals.priceDrop')}
        </FilterCheckbox>
        <FilterCheckbox
          checked={filters.atLowest}
          onCheckedChange={(atLowest) => onChange({ atLowest })}
        >
          {t('pages.dashboard.filters.deals.atLowest')}
        </FilterCheckbox>
      </Section>

      {options.stores.length > 0 && (
        <Section label={t('pages.dashboard.filters.stores')}>
          <Stack gap={2}>
            {options.stores.map((store) => (
              <FilterCheckbox
                key={store.id}
                checked={filters.stores.includes(store.id)}
                onCheckedChange={() =>
                  onChange({ stores: toggle(filters.stores, store.id) })
                }
              >
                {store.name}
              </FilterCheckbox>
            ))}
          </Stack>
        </Section>
      )}

      {options.categories.length > 0 && (
        <Section label={t('pages.dashboard.filters.categories')}>
          <Stack gap={2}>
            {options.categories.map((category) => (
              <FilterCheckbox
                key={category.id}
                checked={filters.categories.includes(category.id)}
                onCheckedChange={() =>
                  onChange({
                    categories: toggle(filters.categories, category.id)
                  })
                }
              >
                <HStack gap={2}>
                  <Circle size="8px" bg={category.color} />
                  {category.name}
                </HStack>
              </FilterCheckbox>
            ))}
          </Stack>
        </Section>
      )}

      <Section label={t('pages.dashboard.filters.priority')}>
        <Stack gap={2}>
          {PRIORITIES.map((priority) => (
            <FilterCheckbox
              key={priority}
              checked={filters.priorities.includes(priority)}
              onCheckedChange={() =>
                onChange({ priorities: toggle(filters.priorities, priority) })
              }
            >
              {t(`common.priority.${priority}`)}
            </FilterCheckbox>
          ))}
        </Stack>
      </Section>
    </VStack>
  );
};
