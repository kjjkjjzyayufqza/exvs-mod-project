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

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeftOpen } from "lucide-react";
import { usePs4Preferences } from "../preferences";
import type { GameId } from "../types";
import { HudButton } from "./Hud";
import { PaneLayout } from "./PaneLayout";
import { Ps4Shell } from "./Ps4Shell";

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
  /** Changing this closes the sources drawer of the focus layout (e.g. the open package). */
  sourcesKey?: string | null;
}

/**
 * Workspace page frame. The pane arrangement follows the user's layout
 * preference: three columns, a focus view with a sources drawer, or a
 * stacked package-over-inspector column.
 */
export function WorkspaceFrame({
  game,
  code,
  platform,
  title,
  credit,
  tools,
  left,
  center,
  right,
  status,
  sourcesKey,
}: WorkspaceFrameProps) {
  const { t } = useTranslation("ps4-workspace");
  const layout = usePs4Preferences((state) => state.workspaceLayout);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => setDrawerOpen(false), [sourcesKey, layout]);

  const shellTools =
    layout === "focus" ? (
      <>
        <HudButton icon={<PanelLeftOpen />} aria-pressed={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
          {t("layout.sources")}
        </HudButton>
        {tools}
      </>
    ) : (
      tools
    );

  return (
    <Ps4Shell game={game} code={code} platform={platform} title={title} credit={credit} tools={shellTools} status={status}>
      {layout === "three" ? (
        <PaneLayout
          storageId={`ps4-${game}-three`}
          panes={[
            { id: "sources", content: left, defaultSize: "23%", minSize: "210px" },
            { id: "package", content: center, defaultSize: "37%", minSize: "280px" },
            { id: "inspector", content: right, defaultSize: "40%", minSize: "320px" },
          ]}
        />
      ) : layout === "stacked" ? (
        <PaneLayout
          storageId={`ps4-${game}-stacked`}
          panes={[
            { id: "sources", content: left, defaultSize: "24%", minSize: "210px" },
            {
              id: "work",
              defaultSize: "76%",
              minSize: "360px",
              content: (
                <PaneLayout
                  orientation="vertical"
                  storageId={`ps4-${game}-stacked-work`}
                  panes={[
                    { id: "package", content: center, defaultSize: "42%", minSize: "160px" },
                    { id: "inspector", content: right, defaultSize: "58%", minSize: "220px" },
                  ]}
                />
              ),
            },
          ]}
        />
      ) : (
        <>
          <div
            className="ps4-drawer-backdrop"
            data-open={drawerOpen}
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="ps4-drawer"
            data-open={drawerOpen}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDrawerOpen(false);
            }}
            {...(!drawerOpen ? { inert: true } : {})}
          >
            {left}
          </div>
          <PaneLayout
            storageId={`ps4-${game}-focus`}
            panes={[
              { id: "package", content: center, defaultSize: "36%", minSize: "280px" },
              { id: "inspector", content: right, defaultSize: "64%", minSize: "360px" },
            ]}
          />
        </>
      )}
    </Ps4Shell>
  );
}
