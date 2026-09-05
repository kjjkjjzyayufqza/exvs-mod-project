import { describe, expect, it } from "vitest";
import { resources } from "./i18n";
import { DEFAULT_APP_LOCALE, SUPPORTED_APP_LOCALES, normalizeAppLocale } from "./locale";

describe("application locales", () => {
  it("normalizes supported locales and defaults to English", () => {
    expect(normalizeAppLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeAppLocale("ja-JP")).toBe(DEFAULT_APP_LOCALE);
    expect(normalizeAppLocale("fr-FR")).toBe(DEFAULT_APP_LOCALE);
    expect(normalizeAppLocale(null)).toBe(DEFAULT_APP_LOCALE);
  });
  it("keeps identical namespaces and keys in every locale", () => {
    const reference = resources[DEFAULT_APP_LOCALE];
    const leafKeys = (value: unknown, prefix = ""): string[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
      return Object.entries(value).flatMap(([key, child]) =>
        leafKeys(child, prefix ? `${prefix}.${key}` : key),
      );
    };
    for (const locale of SUPPORTED_APP_LOCALES) {
      expect(Object.keys(resources[locale]).sort()).toEqual(Object.keys(reference).sort());
      for (const namespace of Object.keys(reference)) {
        expect(leafKeys(resources[locale][namespace]).sort()).toEqual(
          leafKeys(reference[namespace]).sort(),
        );
      }
    }
  });
});
