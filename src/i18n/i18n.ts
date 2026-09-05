import {
  createInstance,
  type Resource,
  type ResourceLanguage,
} from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_APP_LOCALE, readAppLocaleMirror } from "./locale";

type LocaleResourceModule = { default: ResourceLanguage };
const resourceModules = import.meta.glob<LocaleResourceModule>("./resources/*/*.json", { eager: true });
export const resources: Resource = {};
for (const [path, module] of Object.entries(resourceModules)) {
  const match = path.match(/^\.\/resources\/([^/]+)\/([^/]+)\.json$/);
  if (match) (resources[match[1]] ??= {})[match[2]] = module.default;
}

export const appI18n = createInstance();

void appI18n.use(initReactI18next).init({
  resources,
  lng: readAppLocaleMirror(),
  fallbackLng: DEFAULT_APP_LOCALE,
  load: "currentOnly",
  interpolation: {
    escapeValue: false,
  },
});
