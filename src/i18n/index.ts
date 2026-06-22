/**
 * Internationalization (i18next + react-i18next).
 *
 * Translations live as one JSON file per locale under `./locales`. English is
 * the source of truth; `it` mirrors its keys. i18next gives us interpolation
 * (`{name}` placeholders) and plural support for when the string set grows.
 *
 * Components call react-i18next's `useTranslation()` directly; key type-safety
 * comes from the module augmentation in `i18next.d.ts`. This module only owns
 * initialization, the persisted-locale store, and a non-React `t`.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import it from "./locales/it.json";

export type Locale = "en" | "it";

/** Dotted leaf paths of a nested message tree, e.g. "comment.type.bug". */
type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

/** Every valid message key (English is the source of truth). */
export type MessageKey = Leaves<typeof en>;

type Vars = Record<string, string | number>;

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** Persisted active locale. Defaults to the OS language when it is Italian. */
export const useLocale = create<LocaleState>()(
  persist(
    (set) => ({
      locale: navigator.language.startsWith("it") ? "it" : "en",
      setLocale: (locale) => {
        set({ locale });
        void i18n.changeLanguage(locale);
      },
    }),
    { name: "reado.locale" },
  ),
);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, it: { translation: it } },
  lng: useLocale.getState().locale, // honour the persisted choice
  fallbackLng: "en",
  // Our strings use single-brace placeholders (`{name}`), not i18next's default
  // double braces.
  interpolation: { prefix: "{", suffix: "}", escapeValue: false },
  returnNull: false,
});

/** Non-React translator for code outside components (reads the active locale). */
export function t(key: MessageKey, vars?: Vars): string {
  return i18n.t(key, vars ?? {});
}
