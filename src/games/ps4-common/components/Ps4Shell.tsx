/*
 * MBON-Forschung: vollstaendig aus descatals BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
 * In afara arborelui EXVS Mod Project, nu continua portarea.
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * No elimines ni sustituyas los nombres de autor de este aviso.
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
 * Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
 *   VS2-Forschung dieses Projekts.
 */

import { useEffect, type ReactNode } from "react";
import { usePs4Preferences } from "../preferences";
import type { GameId } from "../types";
import "../ps4-workspace.css";

export interface Ps4ShellProps {
  game: GameId;
  code: string;
  platform: string;
  title: string;
  credit: ReactNode;
  tools?: ReactNode;
  status: ReactNode;
  children: ReactNode;
}

/**
 * Root of every MBON / GVS page: masthead, stage and status bar. The user's
 * density, visual style and inspector layout preferences become data
 * attributes that the scoped stylesheet reads.
 */
export function Ps4Shell({ game, code, platform, title, credit, tools, status, children }: Ps4ShellProps) {
  const density = usePs4Preferences((state) => state.density);
  const visualStyle = usePs4Preferences((state) => state.visualStyle);
  const inspectorLayout = usePs4Preferences((state) => state.inspectorLayout);
  const hydrate = usePs4Preferences((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div
      className="ps4-ws flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
      data-game={game}
      data-density={density}
      data-style={visualStyle}
      data-inspector={inspectorLayout}
    >
      <header className="ps4-masthead">
        <div className="ps4-masthead__mark" aria-hidden="true">
          <span className="ps4-masthead__code">{code}</span>
          <span className="ps4-masthead__platform">{platform}</span>
        </div>
        <div className="ps4-masthead__text">
          <h1 className="ps4-masthead__title">{title}</h1>
          <p className="ps4-masthead__credit">{credit}</p>
        </div>
        <div className="ps4-masthead__tools">{tools}</div>
        <div className="ps4-masthead__stripe" aria-hidden="true" />
      </header>
      <div className="ps4-stage">{children}</div>
      <footer className="ps4-status">{status}</footer>
    </div>
  );
}
