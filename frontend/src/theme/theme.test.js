import { system } from '@/theme';

/** Serialized token stylesheet (all `--chakra-*` custom properties). */
const tokenCss = () => JSON.stringify(system.getTokenCss());

/**
 * Count how many CSS scopes (root, dark mode, ...) declare a custom property.
 *
 * @param {object} node - A (nested) style object from `system.getTokenCss()`.
 * @param {string} cssVar - The custom property name, e.g. `--chakra-colors-fg`.
 * @returns {number} Number of declarations found.
 */
const countDeclarations = (node, cssVar) =>
  Object.entries(node).reduce(
    (count, [key, value]) =>
      count +
      (key === cssVar ? 1 : 0) +
      (value && typeof value === 'object'
        ? countDeclarations(value, cssVar)
        : 0),
    0
  );

describe('theme system', () => {
  it('uses Geist for body and headings and Geist Mono for code', () => {
    expect(system.token('fonts.body')).toBe(
      `'Geist Variable', system-ui, sans-serif`
    );
    expect(system.token('fonts.heading')).toBe(
      `'Geist Variable', system-ui, sans-serif`
    );
    expect(system.token('fonts.mono')).toBe(
      `'Geist Mono Variable', ui-monospace, monospace`
    );
    expect(tokenCss()).not.toMatch(/Inter/);
  });

  it.each([
    'bg',
    'bg.subtle',
    'bg.muted',
    'bg.emphasized',
    'fg',
    'fg.muted',
    'fg.subtle',
    'border',
    'border.emphasized',
    'accent',
    'accent.fg',
    'price.down',
    'price.up',
    'price.flat',
    'stock.in',
    'stock.out'
  ])('defines the %s semantic color for light and dark mode', (name) => {
    const cssVar = `--chakra-colors-${name.replace('.', '-')}`;
    expect(system.token(`colors.${name}`)).toBe(`var(${cssVar})`);
    // One declaration for the light (root) scope and one for the dark scope.
    expect(countDeclarations(system.getTokenCss(), cssVar)).toBe(2);
  });

  it('follows the shape rule for radii', () => {
    expect(system.token('radii.md')).toBe('0.5rem');
    expect(system.token('radii.lg')).toBe('0.75rem');
  });

  it('defines the typography text styles', () => {
    const { textStyles } = system._config.theme;
    for (const name of ['display', 'body', 'caption', 'numeric']) {
      expect(textStyles[name]).toBeDefined();
    }
    for (const size of ['lg', 'md', 'sm']) {
      expect(textStyles.heading[size]).toBeDefined();
    }
    expect(system.css({ textStyle: 'numeric' })).toMatchObject({
      fontVariantNumeric: 'tabular-nums'
    });
  });

  it('renders solid buttons with the accent colors', () => {
    const { solid } = system.getRecipe('button').variants.variant;
    expect(solid).toMatchObject({ bg: 'accent', color: 'accent.fg' });
  });

  it('keeps cards flat and bordered with the default card slots intact', () => {
    const card = system.getSlotRecipe('card');
    expect(card.slots).toEqual(
      expect.arrayContaining(['root', 'header', 'body', 'footer'])
    );
    expect(card.base.root).toMatchObject({
      borderRadius: 'lg',
      borderWidth: '1px',
      boxShadow: 'none'
    });
  });

  it('disables motion when the user prefers reduced motion', () => {
    const globalCss = JSON.stringify(system.getGlobalCss());
    expect(globalCss).toContain('prefers-reduced-motion: reduce');
    expect(globalCss).toContain('focus-visible');
  });
});
