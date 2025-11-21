/**
 * Get the currency symbol for a given currency code
 * @param {string} currency - Currency code (e.g., EUR, USD, GBP)
 * @returns {string} Currency symbol (e.g., €, $, £)
 */
export const getCurrencySymbol = (currency) => {
  const currencySymbols = {
    'EUR': '€',
    'USD': '$',
    'GBP': '£',
    'JPY': '¥',
    'CNY': '¥',
    'CAD': '$',
    'AUD': '$'
  };
  return currencySymbols[currency?.toUpperCase()] || currency || '$';
};
