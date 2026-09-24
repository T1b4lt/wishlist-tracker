'use client';

import { ClientOnly, IconButton, Skeleton, Span } from '@chakra-ui/react';
import { ThemeProvider, useTheme } from 'next-themes';

import * as React from 'react';
import { LuMoon, LuSun } from 'react-icons/lu';

// B9: next-themes (0.4.6, the latest stable release as of this writing)
// renders an inline <script> tag as part of the React tree to apply the
// stored theme before paint and avoid a flash of the wrong theme. React 19
// logs a dev-only warning for that pattern ("Encountered a script tag while
// rendering React component..."), because it expects <script> elements to be
// inserted through its resource-loading APIs rather than nested inside a
// component subtree. This is a known upstream incompatibility
// (see https://github.com/pacocoursey/next-themes/issues), not a bug in this
// app: the only newer package version, 1.0.0-beta.0, is a stale pre-release
// (published over a year ago, not the current "latest" or "beta" dist-tag)
// with no confirmed React 19 fix, so upgrading to it is not a clean fix.
// The warning is harmless (dev console noise only; it does not affect
// hydration, styling or runtime behavior), so it is left as-is per the
// hotfix scope.
export function ColorModeProvider(props) {
  return (
    <ThemeProvider attribute="class" disableTransitionOnChange {...props} />
  );
}

export function useColorMode() {
  const { resolvedTheme, setTheme, forcedTheme } = useTheme();
  const colorMode = forcedTheme || resolvedTheme;
  const toggleColorMode = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };
  return {
    colorMode: colorMode,
    setColorMode: setTheme,
    toggleColorMode
  };
}

export function useColorModeValue(light, dark) {
  const { colorMode } = useColorMode();
  return colorMode === 'dark' ? dark : light;
}

export function ColorModeIcon() {
  const { colorMode } = useColorMode();
  return colorMode === 'dark' ? <LuMoon /> : <LuSun />;
}

export const ColorModeButton = React.forwardRef(
  function ColorModeButton(props, ref) {
    const { toggleColorMode } = useColorMode();
    return (
      <ClientOnly fallback={<Skeleton boxSize="9" />}>
        <IconButton
          onClick={toggleColorMode}
          variant="ghost"
          aria-label="Toggle color mode"
          size="sm"
          ref={ref}
          {...props}
          css={{
            _icon: {
              width: '5',
              height: '5'
            }
          }}
        >
          <ColorModeIcon />
        </IconButton>
      </ClientOnly>
    );
  }
);

export const LightMode = React.forwardRef(function LightMode(props, ref) {
  return (
    <Span
      color="fg"
      display="contents"
      className="chakra-theme light"
      colorPalette="gray"
      colorScheme="light"
      ref={ref}
      {...props}
    />
  );
});

export const DarkMode = React.forwardRef(function DarkMode(props, ref) {
  return (
    <Span
      color="fg"
      display="contents"
      className="chakra-theme dark"
      colorPalette="gray"
      colorScheme="dark"
      ref={ref}
      {...props}
    />
  );
});
