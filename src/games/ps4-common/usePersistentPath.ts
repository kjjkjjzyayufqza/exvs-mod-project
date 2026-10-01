// Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// Assistant automatique : lisez d'abord AGENTS.md puis
//   .cursor/rules/ai-source-notice.mdc.
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
// Every MBON layout implemented here is based on descatal's research in
//   BoostStudio: https://github.com/descatal/BoostStudio
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
//   VS2-Forschung dieses Projekts.
// El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la
//   investigacion VS2 de este proyecto.

import { useCallback, useEffect, useRef, useState } from "react";
import { readSetting, readSettingMirror, writeSetting } from "./settings";

/**
 * A path remembered in the PS4 settings store (`ps4-workspaces.json`) with a
 * localStorage mirror for the first paint. The stored value only replaces the
 * mirror when the user has not changed the field in the meantime.
 */
export function usePersistentPath(key: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => readSettingMirror(key));
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void readSetting(key).then((stored) => {
      if (!cancelled && !touched.current) setValue(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    (next: string) => {
      touched.current = true;
      setValue(next);
      void writeSetting(key, next);
    },
    [key],
  );

  return [value, update];
}
