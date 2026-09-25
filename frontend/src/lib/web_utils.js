/**
 * Common ISO 4217 currency codes offered by the product form's currency
 * picker, in display order.
 * @type {string[]}
 */
export const CURRENCY_CODES = [
  'EUR',
  'USD',
  'GBP',
  'JPY',
  'CNY',
  'CAD',
  'AUD',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'MXN',
  'BRL',
  'INR'
];

const CURRENCY_SYMBOLS = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  CAD: '$',
  AUD: '$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  MXN: '$',
  BRL: 'R$',
  INR: '₹'
};

/**
 * Get the currency symbol for a given currency code
 * @param {string} currency - Currency code (e.g., EUR, USD, GBP)
 * @returns {string} Currency symbol (e.g., €, $, £)
 */
export const getCurrencySymbol = (currency) => {
  return CURRENCY_SYMBOLS[currency?.toUpperCase()] || currency || '$';
};

/**
 * Get the translated label for a priority value
 * @param {string} priority - Product priority value
 * @param {Function} translate - i18n translate function
 * @returns {string} Translated priority label or original value when missing
 */
export const getPriorityLabel = (priority, translate) => {
  if (!priority) return '';

  const keyMap = {
    high: 'common.priority.high',
    medium: 'common.priority.medium',
    low: 'common.priority.low'
  };

  const normalizedPriority = priority.toLowerCase();
  const translationKey = keyMap[normalizedPriority];

  if (translationKey && typeof translate === 'function') {
    return translate(translationKey);
  }

  if (translationKey) {
    return (
      normalizedPriority.charAt(0).toUpperCase() + normalizedPriority.slice(1)
    );
  }

  return priority;
};
