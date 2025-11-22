import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import english from './english.json';
import spanish from './spanish.json';

const resources = {
  english: { translation: english },
  spanish: { translation: spanish }
};

export const LANGUAGE_STORAGE_KEY = 'selected_language';
export const DEFAULT_LANGUAGE = 'english';
export const SUPPORTED_LANGUAGES = Object.keys(resources);

const resolveInitialLanguage = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
    return stored;
  }

  localStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE);
  return DEFAULT_LANGUAGE;
};

export const persistLanguagePreference = (language) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = SUPPORTED_LANGUAGES.includes(language)
    ? language
    : DEFAULT_LANGUAGE;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false
    }
  });
}

export default i18n;
