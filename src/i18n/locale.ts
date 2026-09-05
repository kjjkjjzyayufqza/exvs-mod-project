export const SUPPORTED_APP_LOCALES = ["en-US", "zh-CN"] as const;

export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = "en-US";
export const APP_LOCALE_STORE_KEY = "appLocale";

const APP_LOCALE_MIRROR_KEY = "app:locale";

export function normalizeAppLocale(value: unknown): AppLocale {
  return typeof value === "string" &&
    SUPPORTED_APP_LOCALES.includes(value as AppLocale)
    ? (value as AppLocale)
    : DEFAULT_APP_LOCALE;
}

export function readAppLocaleMirror(): AppLocale {
  try {
    return normalizeAppLocale(window.localStorage.getItem(APP_LOCALE_MIRROR_KEY));
  } catch {
    return DEFAULT_APP_LOCALE;
  }
}

export function writeAppLocaleMirror(locale: AppLocale): void {
  try {
    window.localStorage.setItem(APP_LOCALE_MIRROR_KEY, locale);
  } catch {
    // The Tauri store remains authoritative when localStorage is unavailable.
  }
}
