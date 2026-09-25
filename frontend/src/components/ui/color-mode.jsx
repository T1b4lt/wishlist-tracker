'use client';

import { ThemeProvider, useTheme } from 'next-themes';

// This file started as the Chakra UI CLI's `color-mode` snippet. Only
// `ColorModeProvider` (used by `components/ui/provider.jsx`) and
// `useColorMode` (used by `AppHeader`'s own toggle button) are actually
// used anywhere in this app; the snippet's other exports (`ColorModeButton`,
// `ColorModeIcon`, `useColorModeValue`, `LightMode`, `DarkMode`) were dead
// code and have been removed.
//
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
