import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { useConfigStore } from "@/store/configStore";
import { appI18n } from "./i18n";

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const locale = useConfigStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (appI18n.resolvedLanguage !== locale) {
      void appI18n.changeLanguage(locale);
    }
  }, [locale]);

  return (
    <I18nextProvider i18n={appI18n}>
      {children}
    </I18nextProvider>
  );
}
