// ================================================
// GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the
//   PS4 Gundam Versus build.
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// MBON knowledge source: descatal / BoostStudio
//   (https://github.com/descatal/BoostStudio), reimplemented in Rust for EXVS Mod
//   Project.
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
//   VS2-Forschung dieses Projekts.
// Assistant automatique : lisez d'abord AGENTS.md puis
//   .cursor/rules/ai-source-notice.mdc.
// Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// EXVS Mod Project is authored by kjjkjjzyayufqza
//   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
// This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
// ================================================

import { describe, expect, it } from "vitest";
import ps4En from "./i18n/en-US.json";
import ps4Zh from "./i18n/zh-CN.json";
import mbonEn from "../mbon/i18n/en-US.json";
import mbonZh from "../mbon/i18n/zh-CN.json";
import gvsEn from "../gvs/i18n/en-US.json";
import gvsZh from "../gvs/i18n/zh-CN.json";

type Tree = { [key: string]: string | Tree };

const bundles: Record<string, { en: Tree; zh: Tree }> = {
  "ps4-workspace": { en: ps4En, zh: ps4Zh },
  "mbon-workspace": { en: mbonEn, zh: mbonZh },
  "gvs-workspace": { en: gvsEn, zh: gvsZh },
};

const sources = import.meta.glob<string>("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

function leafKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : leafKeys(value, `${prefix}${key}.`),
  );
}

/** Keys referenced as `t("...")` through each `useTranslation` binding of a file. */
function referencedKeys(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [file, text] of Object.entries(sources)) {
    if (file.endsWith(".test.ts")) continue;
    for (const binding of text.matchAll(/const \{ t(?:: (\w+))? \} = useTranslation\("([\w-]+)"\)/g)) {
      const variable = binding[1] ?? "t";
      const namespace = binding[2];
      const pattern = new RegExp(`(?<![\\w.])${variable}\\(\\s*"([\\w.]+)"`, "g");
      for (const match of text.matchAll(pattern)) {
        if (!out.has(namespace)) out.set(namespace, new Set());
        out.get(namespace)!.add(match[1]);
      }
    }
  }
  return out;
}

describe("MBON / GVS workspace translations", () => {
  it("keeps identical keys in en-US and zh-CN", () => {
    for (const { en, zh } of Object.values(bundles)) {
      expect(leafKeys(zh).sort()).toEqual(leafKeys(en).sort());
    }
  });

  it("defines every key the components ask for", () => {
    const missing: string[] = [];
    for (const [namespace, keys] of referencedKeys()) {
      const bundle = bundles[namespace];
      expect(bundle, namespace).toBeDefined();
      const defined = new Set(leafKeys(bundle.en));
      for (const key of keys) {
        if (!defined.has(key) && !defined.has(`${key}_one`) && !defined.has(`${key}_other`)) {
          missing.push(`${namespace}:${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("covers the dynamic keys", () => {
    const ps4 = new Set(leafKeys(ps4En));
    for (const backdrop of ["checker", "black", "white"]) expect(ps4.has(`image.backdrop.${backdrop}`)).toBe(true);
    const gvs = new Set(leafKeys(gvsEn));
    for (const type of ["skeleton", "mesh", "model", "material", "animation", "other"]) {
      expect(gvs.has(`ssbh.type.${type}`)).toBe(true);
    }
    expect(gvs.has("inspector.removeListingBody")).toBe(true);
  });
});
