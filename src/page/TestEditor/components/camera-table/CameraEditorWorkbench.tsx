import { useState, type ReactNode } from "react";
import { FolderOpen, PackagePlus, PanelLeftClose, PanelLeftOpen, RefreshCw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { SoundTableMetaLine, SoundTableWorkbenchStatus } from "../sound-table/SoundTableWorkbench";

type CameraEditorWorkbenchProps = {
  isActive: boolean;
  title: string;
  purpose?: string;
  status: SoundTableWorkbenchStatus;
  errorMessage?: string | null;
  unpackLabel: string;
  unpacking: boolean;
  unpackDisabled: boolean;
  onUnpack: () => void;
  onReload: () => void;
  onSave: () => void;
  canSave: boolean;
  writable: boolean;
  toolbarExtra?: ReactNode;
  familyControl?: ReactNode;
  loadedLabel?: string;
  metaLines?: SoundTableMetaLine[];
  filesSummaryLabel?: string;
  notice?: ReactNode;
  warning?: ReactNode;
  listPanel: ReactNode;
  inspectorPanel: ReactNode;
  stagePanel: ReactNode;
};

const toolbarBtnClass =
  "inline-flex h-9 items-center gap-1.5 px-2.5 transition-[background-color,box-shadow,transform,color] duration-150 ease-out active:scale-[0.96]";

function FilesMeta({ lines }: { lines: SoundTableMetaLine[] }) {
  const { t } = useTranslation("test-lists");
  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <div key={line.label} className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{line.label}</div>
          <div className="mt-0.5 flex items-start gap-1">
            <p className="min-w-0 break-all font-mono text-[11px] tabular-nums text-pretty">{line.value || "-"}</p>
            {line.value && line.onOpen ? (
              <button
                type="button"
                onClick={line.onOpen}
                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent hover:text-accent-foreground"
                title={t("common.openFolder")}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CameraEditorWorkbench({
  isActive,
  title,
  purpose,
  status,
  errorMessage,
  unpackLabel,
  unpacking,
  unpackDisabled,
  onUnpack,
  onReload,
  onSave,
  canSave,
  writable,
  toolbarExtra,
  familyControl,
  loadedLabel,
  metaLines,
  filesSummaryLabel,
  notice,
  warning,
  listPanel,
  inspectorPanel,
  stagePanel,
}: CameraEditorWorkbenchProps) {
  const { t } = useTranslation("test-lists");
  const [railCollapsed, setRailCollapsed] = useState(false);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  const ready = status === "ready";

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
          onClick={() => setRailCollapsed((prev) => !prev)}
          title={railCollapsed ? t("cameraTable.showRail") : t("cameraTable.hideRail")}
          aria-label={railCollapsed ? t("cameraTable.showRail") : t("cameraTable.hideRail")}
          aria-pressed={railCollapsed}
          disabled={!ready}
        >
          {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        <div className="min-w-0 shrink-0">
          <h2 className="truncate text-sm font-semibold leading-none text-balance" title={purpose}>
            {title}
          </h2>
        </div>
        {ready ? familyControl : null}
        {loadedLabel ? (
          <span className="hidden min-w-0 truncate font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
            {loadedLabel}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {ready && (metaLines?.length ?? 0) > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className={toolbarBtnClass}>
                  <FolderOpen className="h-4 w-4" />
                  {filesSummaryLabel ?? t("cameraTable.workspaceFiles")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <FilesMeta lines={metaLines ?? []} />
              </PopoverContent>
            </Popover>
          ) : null}
          {toolbarExtra}
          <Button type="button" size="sm" variant="outline" onClick={onReload} className={toolbarBtnClass}>
            <RefreshCw className="h-4 w-4" />
            {t("common.reload")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={!writable || !canSave}
            className={toolbarBtnClass}
          >
            <Save className="h-4 w-4" />
            {t("common.saveFile")}
          </Button>
        </div>
      </header>

      {notice ? <div className="shrink-0 px-2.5 pt-2">{notice}</div> : null}
      {warning ? <div className="shrink-0 px-2.5 pt-2">{warning}</div> : null}

      {status === "loading" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("common.loadingEllipsis")}
        </div>
      ) : null}

      {status === "missing" || status === "idle" || status === "error" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {status === "error" && errorMessage ? (
            <p className="max-w-lg text-sm text-pretty text-destructive">{errorMessage}</p>
          ) : (
            <p className="max-w-lg text-sm text-pretty text-muted-foreground">{t("sound.tableMissing")}</p>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onUnpack}
            disabled={unpackDisabled || unpacking}
            className="inline-flex h-9 items-center gap-2 transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
          >
            <PackagePlus className="h-4 w-4" />
            {unpacking ? t("sound.unpacking") : unpackLabel}
          </Button>
        </div>
      ) : null}

      {ready ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          key={railCollapsed ? "camera-stage" : "camera-rail-stage"}
        >
          {railCollapsed ? null : (
            <>
              <ResizablePanel defaultSize="26%" minSize="20%" maxSize="40%" className="min-h-0">
                <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
                  <ResizablePanel defaultSize="44%" minSize="22%" className="min-h-0">
                    <div className="flex h-full min-h-0 flex-col border-r">{listPanel}</div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize="56%" minSize="28%" className="min-h-0">
                    <div className="flex h-full min-h-0 flex-col border-r">{inspectorPanel}</div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel defaultSize={railCollapsed ? "100%" : "74%"} minSize="48%" className="min-h-0">
            <section className={cn("flex h-full min-h-0 min-w-0 flex-col bg-zinc-950")}>{stagePanel}</section>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : null}
    </div>
  );
}
