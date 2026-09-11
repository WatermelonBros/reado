/**
 * Internationalization (i18next + react-i18next).
 *
 * Translations live as one JSON file per locale under `./locales`. English is
 * the source of truth; every other locale mirrors its keys (a test enforces it). i18next gives us interpolation
 * (`{name}` placeholders) and plural support for when the string set grows.
 *
 * Components call react-i18next's `useTranslation()` directly; key type-safety
 * comes from the module augmentation in `i18next.d.ts`. This module only owns
 * initialization, the persisted-locale store, and a non-React `t`.
 */

import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import de from "./locales/de.json"
import en from "./locales/en.json"
import es from "./locales/es.json"
import fr from "./locales/fr.json"
import it from "./locales/it.json"

/**
 * The languages Reado ships, in the order the picker lists them.
 *
 * One list: the resources i18next loads, the options in Settings and the
 * `Locale` type all read it, so adding a language is a file plus a line here and
 * nothing can disagree about which languages exist. English is the source of
 * truth for the *keys* — `locales.test.ts` fails if any locale drifts from it.
 */
export const LOCALES = [
  { code: "en", label: "English", messages: en },
  { code: "it", label: "Italiano", messages: it },
  { code: "es", label: "Español", messages: es },
  { code: "fr", label: "Français", messages: fr },
  { code: "de", label: "Deutsch", messages: de },
] as const

export type Locale = (typeof LOCALES)[number]["code"]

/** The shipped locale matching the OS language, or English. */
export function systemLocale(): Locale {
  const tag = navigator.language.toLowerCase()
  return LOCALES.find((l) => tag.startsWith(l.code))?.code ?? "en"
}

/** Dotted leaf paths of a nested message tree, e.g. "comment.type.bug". */
type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`
    }[keyof T & string]

/** Every valid message key (English is the source of truth). */
export type MessageKey = Leaves<typeof en>

type Vars = Record<string, string | number>

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

/** Persisted active locale. Defaults to the OS language when it is Italian. */
export const useLocale = create<LocaleState>()(
  persist(
    (set) => ({
      locale: systemLocale(),
      setLocale: (locale) => {
        set({ locale })
        void i18n.changeLanguage(locale)
      },
    }),
    { name: "reado.locale" },
  ),
)

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LOCALES.map((l) => [l.code, { translation: l.messages }])),
  lng: useLocale.getState().locale, // honour the persisted choice
  fallbackLng: "en",
  // Our strings use single-brace placeholders (`{name}`), not i18next's default
  // double braces.
  interpolation: { prefix: "{", suffix: "}", escapeValue: false },
  returnNull: false,
})

/** Non-React translator for code outside components (reads the active locale). */
export function t(key: MessageKey, vars?: Vars): string {
  return i18n.t(key, vars ?? {})
}
