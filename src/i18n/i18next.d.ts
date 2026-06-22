/**
 * Type-safe keys for react-i18next: point i18next at the English resource so
 * `useTranslation().t("comment.type.bug")` is checked against the real message
 * tree (invalid keys are compile errors).
 */
import "i18next";
import type en from "./locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
