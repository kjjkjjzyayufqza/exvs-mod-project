//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
// Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB code.
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche VS2 de ce projet.
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
//   Projekts.
// Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
// Investigacion de MBON: toda proviene del repositorio BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// EXVS Mod Project is authored by kjjkjjzyayufqza
//   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
// Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//

import { Fragment, type ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

export interface PaneSpec {
  id: string;
  content: ReactNode;
  defaultSize: string;
  minSize: string;
}

function layoutStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Resizable panes whose sizes persist per `storageId`. */
export function PaneLayout({
  storageId,
  panes,
  orientation = "horizontal",
}: {
  storageId: string;
  panes: PaneSpec[];
  orientation?: "horizontal" | "vertical";
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: storageId, storage: layoutStorage() });
  return (
    <Group orientation={orientation} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      {panes.map((pane, index) => (
        <Fragment key={pane.id}>
          {index > 0 ? <Separator className={orientation === "horizontal" ? "ps4-gutter" : "ps4-gutter-h"} /> : null}
          <Panel id={pane.id} defaultSize={pane.defaultSize} minSize={pane.minSize}>
            {pane.content}
          </Panel>
        </Fragment>
      ))}
    </Group>
  );
}
