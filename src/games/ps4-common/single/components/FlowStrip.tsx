//
// ================================================
// GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza
//   to the PS4 Gundam Versus build.
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
// Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
//   ACCEPTABLE_USE.md.
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
// MBON knowledge source: descatal / BoostStudio
//   (https://github.com/descatal/BoostStudio), reimplemented in Rust for EXVS
//   Mod Project.
// Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ================================================
//

import { CornerDownRight } from "lucide-react";

/** Source → destination strip, so the effect of the action is visible up front. */
export function FlowStrip({ from, to, empty }: { from: string | null; to: string | null; empty: string }) {
  return (
    <div className="ps4-flow" aria-live="polite">
      <bdi className="ps4-flow__end" data-empty={!from}>
        {from ?? empty}
      </bdi>
      <CornerDownRight aria-hidden="true" />
      <bdi className="ps4-flow__end" data-empty={!to}>
        {to ?? empty}
      </bdi>
    </div>
  );
}
