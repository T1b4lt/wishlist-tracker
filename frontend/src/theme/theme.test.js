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
    for (const name of [
      'display',
      'heading.lg',
      'heading.md',
      'heading.sm',
      'body',
      'caption'
    ]) {
      expect(system.css({ textStyle: name })).toHaveProperty('fontFamily');
    }
    expect(system.css({ textStyle: 'numeric' })).toMatchObject({
      fontVariantNumeric: 'tabular-nums'
    });
  });

  it('renders default solid buttons with the accent colors', () => {
    const { solid } = system.getRecipe('button').variants.variant;
    expect(solid).toMatchObject({
      bg: 'colorPalette.solid',
      color: 'colorPalette.contrast'
    });
    // `gray` is the default palette; its solid pair resolves to the accent.
    expect(system.getGlobalCss()['@layer base']['&html']).toMatchObject({
      '--chakra-colors-color-palette-solid': 'var(--chakra-colors-gray-solid)',
      '--chakra-colors-color-palette-contrast':
        'var(--chakra-colors-gray-contrast)'
    });
    expect(tokenCss()).toContain(
      '"--chakra-colors-gray-solid":"var(--chakra-colors-accent)"'
    );
    expect(tokenCss()).toContain(
      '"--chakra-colors-gray-contrast":"var(--chakra-colors-accent-fg)"'
    );
  });

  it('keeps the red palette for destructive solid buttons', () => {
    expect(tokenCss()).toMatch(
      /"--chakra-colors-red-solid":"var\(--chakra-colors-red-600\)"/
    );
    const redSolid = system.css({
      colorPalette: 'red',
      bg: 'colorPalette.solid'
    });
    expect(JSON.stringify(redSolid)).toContain('--chakra-colors-red-solid');
  });

  it('keeps default cards flat and bordered and elevated cards border-free', () => {
    const card = system.getSlotRecipe('card');
    expect(card.slots).toEqual(
      expect.arrayContaining(['root', 'header', 'body', 'footer'])
    );
    expect(card.base.root).toMatchObject({ borderRadius: 'lg' });
    expect(card.base.root).not.toHaveProperty('borderWidth');
    expect(card.defaultVariants.variant).toBe('outline');
    expect(card.variants.variant.outline.root).toMatchObject({
      borderWidth: '1px',
      borderColor: 'border',
      boxShadow: 'none'
    });
    expect(card.variants.variant.elevated.root).not.toHaveProperty(
      'borderWidth'
    );
  });

  it('disables motion when the user prefers reduced motion', () => {
    const globalCss = JSON.stringify(system.getGlobalCss());
    expect(globalCss).toContain('prefers-reduced-motion: reduce');
    expect(globalCss).toContain('focus-visible');
  });

  it('exposes the shared motion durations and easing as Chakra tokens', () => {
    expect(system.token('durations.fast')).toBe('150ms');
    expect(system.token('durations.normal')).toBe('220ms');
    expect(system.token('durations.slow')).toBe('350ms');
    expect(system.token('easings.easeOut')).toBe(
      'cubic-bezier(0.16, 1, 0.3, 1)'
    );
  });
});
