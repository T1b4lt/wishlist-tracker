# Frontend

## Testing

Unit and component tests use [Vitest](https://vitest.dev) with
[Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

```bash
npm test          # run the suite once
npm run test:watch  # re-run on file changes
```

Test files live next to the code they cover (`*.test.js` / `*.test.jsx`).
Shared test infrastructure lives in `src/test/`:

- `src/test/setup.js`: global test setup (jest-dom matchers, jsdom polyfills).
- `src/test/renderWithProviders.jsx`: renders a component wrapped in the
  Chakra UI provider and the i18n instance, for component tests.
