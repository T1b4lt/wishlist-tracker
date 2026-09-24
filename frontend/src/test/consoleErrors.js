import { vi } from 'vitest';

/**
 * Matches `console.error` messages that are known, pre-existing noise
 * unrelated to whatever component a test is checking for warnings.
 *
 * Currently only next-themes' inline `<script>` tag, which trips a React 19
 * dev-only warning ("Encountered a script tag while rendering React
 * component...") the first time `ColorModeProvider` mounts in a test file.
 * See `src/components/ui/color-mode.jsx` for why it is left as-is.
 */
const KNOWN_NOISE = /Encountered a script tag/;

/**
 * Spies on `console.error` for the rest of the test, collecting calls but
 * silencing them so they do not print. Call the returned function after
 * rendering to assert no *unexpected* warnings were logged (filtering out
 * `KNOWN_NOISE`) and restore the spy.
 *
 * @returns {() => unknown[]} Call to get the list of unexpected messages and restore `console.error`.
 */
export function spyOnConsoleError() {
  const messages = [];
  const consoleError = vi
    .spyOn(console, 'error')
    .mockImplementation((message) => {
      messages.push(message);
    });

  return () => {
    consoleError.mockRestore();
    return messages.filter((message) => !KNOWN_NOISE.test(String(message)));
  };
}
