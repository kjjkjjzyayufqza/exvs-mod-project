/*
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * EXVS Mod Project is authored by kjjkjjzyayufqza
 *   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
 * Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
 * MBON research credit: all MBON format research comes from descatal's BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import { appI18n } from "@/i18n/i18n";
import enUS from "./i18n/en-US.json";
import zhCN from "./i18n/zh-CN.json";

export const PS4_NAMESPACE = "ps4-workspace";

/** Add a workspace namespace to the shared app i18n instance (idempotent). */
export function registerWorkspaceBundles(namespace: string, bundles: Record<string, object>): void {
  for (const [locale, bundle] of Object.entries(bundles)) {
    if (!appI18n.hasResourceBundle(locale, namespace)) {
      appI18n.addResourceBundle(locale, namespace, bundle, true, true);
    }
  }
}

registerWorkspaceBundles(PS4_NAMESPACE, { "en-US": enUS, "zh-CN": zhCN });
