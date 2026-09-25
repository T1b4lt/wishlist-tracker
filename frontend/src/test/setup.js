import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia. Chakra UI and next-themes (used by
// the color mode provider) rely on it, so component tests need a stub.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  });
}

// jsdom does not implement `ResizeObserver`. Chakra's floating-positioned
// content (Menu, Select, Popover, ...) uses it, through `@floating-ui/dom`'s
// `autoUpdate`, to reposition itself when open, so any test that opens one
// needs a stub.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement `Element.scrollTo`/`scrollIntoView`. Zag-js's
// Select/Combobox call `scrollTo` on their open listbox to reset or adjust
// its scroll position, so any test that opens one needs a stub.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
