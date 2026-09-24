/**
 * Get the currency symbol for a given currency code
 * @param {string} currency - Currency code (e.g., EUR, USD, GBP)
 * @returns {string} Currency symbol (e.g., €, $, £)
 */
export const getCurrencySymbol = (currency) => {
  const currencySymbols = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    CAD: '$',
    AUD: '$'
  };
  return currencySymbols[currency?.toUpperCase()] || currency || '$';
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
