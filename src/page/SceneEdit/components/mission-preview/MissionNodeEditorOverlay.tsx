import { Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import MissionNodeEditorPage, { type MissionNodeEditorHost } from "@/page/MissionNodeEditor/page";
import type { MissionEditorSurface } from "./useMissionAuthoringSession";

/**
 * Fullscreen mission node editor hosted by the scene page.
 * Minimize keeps the editor mounted so the map can be dragged underneath.
 * Close only hides the layer; the shared graph stays on the markers.
 */
export function MissionNodeEditorOverlay({
  surface,
  host,
  dirty,
  onMinimize,
  onRestore,
  onClose,
}: {
  surface: MissionEditorSurface;
  host: MissionNodeEditorHost;
  dirty: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("scene-mission-preview");
  if (surface === "hidden") return null;
  const minimized = surface === "minimized";
  const name = host.file.path.split(/[\\/]/).at(-1) ?? host.file.path;
  return <>
    <div
      className={`fixed inset-x-0 bottom-0 z-220 flex flex-col bg-background ${minimized ? "pointer-events-none invisible" : ""}`}
      style={{ top: "var(--layout-topbar-height)" }}
      aria-hidden={minimized}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {name}{dirty ? ` · ${t("status.unsaved")}` : ""}
        </span>
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={t("actions.minimize")} onClick={onMinimize}>
          <Minus className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={t("actions.closeEditor")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <MissionNodeEditorPage host={host} active={!minimized} />
      </div>
    </div>
    {minimized && (
      <button
        type="button"
        className="fixed right-3 z-220 rounded-md border bg-card px-3 py-1.5 text-xs shadow-md"
        style={{ top: "calc(var(--layout-topbar-height) + 0.75rem)" }}
        onClick={onRestore}
      >
        {t("actions.restoreEditor")}
      </button>
    )}
  </>;
}
