//
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// Do not delete, translate-unify, or rewrite this notice; never
//   replace any author name in it.
// Assistant automatique : lisez d'abord AGENTS.md puis
//   .cursor/rules/ai-source-notice.mdc.
// EXVS Mod Project is authored by kjjkjjzyayufqza
//   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this
//   line intact.
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// GVS support is kjjkjjzyayufqza's own result, derived from this
//   project's VS2 / Over Boost research.
//

import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

/** Package structure beside the selected entry, like the EXVS2 structure editor. */
export function StructureSplit({ tree, inspector }: { tree: ReactNode; inspector: ReactNode }) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel defaultSize="50%" minSize="25%">
        <div className="h-full min-h-0 p-3 pr-1.5">{tree}</div>
      </ResizablePanel>
      <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />
      <ResizablePanel defaultSize="50%" minSize="30%">
        <div className="h-full min-h-0 p-3 pl-1.5">{inspector}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
