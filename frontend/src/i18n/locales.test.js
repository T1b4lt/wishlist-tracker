import english from './english.json';
import spanish from './spanish.json';

/**
 * Flattens a nested translation object into a sorted list of dot-separated
 * leaf key paths, e.g. `{ a: { b: 1 } }` -> `['a.b']`.
 *
 * @param {object} value
 * @param {string} [prefix]
 * @returns {string[]}
 */
const flattenKeys = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenKeys(child, path)
      : [path];
  });

/**
 * Every string value in a nested translation object, alongside the
 * dot-separated key path it lives at (for readable failure messages).
 *
 * @param {object} value
 * @param {string} [prefix]
 * @returns {{ path: string, text: string }[]}
 */
const flattenValues = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return flattenValues(child, path);
    }
    return typeof child === 'string' ? [{ path, text: child }] : [];
  });

describe('i18n locale parity', () => {
  it('defines the exact same set of keys in english.json and spanish.json', () => {
    const englishKeys = flattenKeys(english).sort();
    const spanishKeys = flattenKeys(spanish).sort();

    // Report each direction separately so a mismatch says which locale is
    // missing (or has an extra) key, instead of just "not equal".
    expect(englishKeys.filter((key) => !spanishKeys.includes(key))).toEqual([]);
    expect(spanishKeys.filter((key) => !englishKeys.includes(key))).toEqual([]);
    expect(englishKeys).toEqual(spanishKeys);
  });

  it('never uses an em dash or en dash in a user-visible string', () => {
    const dash = /[—–]/;

    for (const [name, locale] of [
      ['english', english],
      ['spanish', spanish]
    ]) {
      const offenders = flattenValues(locale).filter(({ text }) =>
        dash.test(text)
      );
      expect(
        offenders,
        `${name}.json has em/en dashes: ${JSON.stringify(offenders)}`
      ).toEqual([]);
    }
  });
});
