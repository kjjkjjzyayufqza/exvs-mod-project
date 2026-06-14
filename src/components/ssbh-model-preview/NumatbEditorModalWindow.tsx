import { useEffect, useRef, useState } from "react";
import { FileJson, Layers, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { NumatbProfileKind } from "./daeSsbhTypes";
import { NumatbTemplateEditorModalBody } from "./NumatbTemplateEditorModalBody";
import type { NumatbModalBundle } from "./numatbEditorUtils";
import { ssbhLoadSsbhFileAsJson } from "./ssbhDaeIoService";
import {
  isSsbhEditorDialogActive,
  SsbhEditorModalWindowShell,
  type ModalViewportSuspendInteraction,
} from "./SsbhEditorModalWindowShell";

export type NumatbEditorWindowSession = {
  id: string;
  filePath: string;
  primaryProfile: NumatbProfileKind;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: NumatbModalBundle | null;
  draftData: NumatbModalBundle | null;
  isDirty: boolean;
  zIndex: number;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type NumatbEditorModalWindowProps = {
  session: NumatbEditorWindowSession;
  cascadeIndex: number;
  onActivate: () => void;
  onCloseRequest: () => void;
  onDraftChange: (next: NumatbModalBundle) => void;
  onSave: () => void;
  onReset: () => void;
  onReloadRequest: () => void;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function NumatbEditorModalWindow({
  session,
  cascadeIndex,
  onActivate,
  onCloseRequest,
  onDraftChange,
  onSave,
  onReset,
  onReloadRequest,
  skipActivate,
  viewportSuspend,
}: NumatbEditorModalWindowProps) {
  const dirty = session.isDirty;
  const titleId = `numatb-editor-title-${session.id}`;

  const draftRef = useRef(session.draftData);
  const savingRef = useRef(session.saving);
  const loadingRef = useRef(session.loading);
  draftRef.current = session.draftData;
  savingRef.current = session.saving;
  loadingRef.current = session.loading;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (isSsbhEditorDialogActive(titleId)) {
          e.preventDefault();
          const draft = draftRef.current;
          if (!savingRef.current && draft && !loadingRef.current) {
            onSave();
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, titleId]);

  const title = fileBasename(session.filePath);
  const [jsonExportBusy, setJsonExportBusy] = useState(false);

  const exportNumatbJsonToDirectory = async () => {
    const src = session.filePath.trim();
    if (!src || session.loading) {
      return;
    }
    setJsonExportBusy(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose folder to export NUMATB JSON",
      });
      if (typeof selected !== "string" || !selected.trim()) {
        return;
      }
      const envelope = await ssbhLoadSsbhFileAsJson(src);
      const outName = `${fileBasename(src)}.json`;
      const outPath = await join(selected, outName);
      await writeTextFile(outPath, JSON.stringify(envelope, null, 2));
      toast.success("NUMATB exported as JSON", { description: outPath });
    } catch (e) {
      const msg = String(e);
      toast.error("Failed to export NUMATB as JSON", { description: msg });
    } finally {
      setJsonExportBusy(false);
    }
  };
  const footer =
    !session.loading && !session.loadError && session.draftData ? (
      <div className="flex flex-wrap items-center justify-end gap-2 bg-muted/20 px-5 py-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving || session.loading || jsonExportBusy}
          onClick={() => void exportNumatbJsonToDirectory()}
          title="Read the .numatb from disk and write JSON (filePath, format, data) to the chosen folder"
        >
          {jsonExportBusy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileJson className="mr-1 h-3.5 w-3.5" />
          )}
          Export JSON...
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving || session.loading}
          onClick={onReloadRequest}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Reload
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving || !dirty}
          onClick={onReset}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide"
          disabled={session.saving || !dirty}
          onClick={() => {
            if (!session.draftData) return;
            onSave();
          }}
        >
          {session.saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          {session.saving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving}
          onClick={onCloseRequest}
        >
          Close
        </Button>
      </div>
    ) : null;

  return (
    <SsbhEditorModalWindowShell
      kind="numatb"
      cascadeIndex={cascadeIndex}
      zIndex={session.zIndex}
      titleId={titleId}
      title={dirty ? `• ${title}` : title}
      subtitle="Edit SSBH (.numatb) material template"
      headerIcon={<Layers className="h-4 w-4 text-primary" />}
      onActivate={onActivate}
      onClose={onCloseRequest}
      closeDisabled={session.saving}
      skipActivate={skipActivate}
      viewportSuspend={viewportSuspend}
      footer={footer}
    >
      {session.loading ? (
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading NUMATB...
        </div>
      ) : session.loadError ? (
        <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
      ) : session.draftData ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-4 border-b border-border/60 bg-muted/20 px-5 py-4">
            <p
              className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground"
              title={session.filePath}
            >
              {session.filePath}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <NumatbTemplateEditorModalBody
              bundle={session.draftData}
              onChange={onDraftChange}
              disabled={session.saving}
              defaultActiveProfile={session.primaryProfile}
            />
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground">No data.</div>
      )}
    </SsbhEditorModalWindowShell>
  );
}
