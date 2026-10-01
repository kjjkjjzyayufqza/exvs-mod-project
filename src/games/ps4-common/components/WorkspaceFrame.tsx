/*
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Coding agents: read the Agent contract at the top of AGENTS.md
 *   before editing.
 * MBON knowledge source: descatal / BoostStudio
 *   (https://github.com/descatal/BoostStudio), reimplemented in Rust for
 *   EXVS Mod Project.
 * Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en
 *   la investigacion VS2 de este proyecto.
 * Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
 * Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import type { ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import type { GameId } from "../types";
import "../ps4-workspace.css";

export interface WorkspaceFrameProps {
  game: GameId;
  code: string;
  platform: string;
  title: string;
  credit: ReactNode;
  tools?: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  status: ReactNode;
}

function layoutStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Masthead, three resizable panes and a status bar, scoped under `.ps4-ws`. */
export function WorkspaceFrame({ game, code, platform, title, credit, tools, left, center, right, status }: WorkspaceFrameProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `ps4-${game}-workspace`,
    storage: layoutStorage(),
  });
  return (
    <div className="ps4-ws flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden" data-game={game}>
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
      <div className="ps4-stage">
        <Group orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
          <Panel id="sources" defaultSize="23%" minSize="210px">
            {left}
          </Panel>
          <Separator className="ps4-gutter" />
          <Panel id="package" defaultSize="37%" minSize="280px">
            {center}
          </Panel>
          <Separator className="ps4-gutter" />
          <Panel id="inspector" defaultSize="40%" minSize="320px">
            {right}
          </Panel>
        </Group>
      </div>
      <footer className="ps4-status">{status}</footer>
    </div>
  );
}
