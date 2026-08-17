import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShlEditorModalWindow, type ShlEditorWindowSession } from "./ShlEditorModalWindow";
import type { ShlFileData } from "./shlIoService";
import type { ModalViewportSuspendInteraction } from "./SsbhEditorModalWindowShell";

type ShlEditorModalHostProps = {
  sessions: ShlEditorWindowSession[];
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: ShlFileData) => void;
  onSave: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
  viewportSuspend?: ModalViewportSuspendInteraction;
  /** Structure-JSON model folder names in order; index = folder_index. */
  modelFolderNames?: string[];
  bodySlotRequired?: boolean;
};

export function ShlEditorModalHost({
  sessions,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
  viewportSuspend,
  modelFolderNames,
  bodySlotRequired = true,
}: ShlEditorModalHostProps) {
  const topZIndex = useMemo(
    () => (sessions.length === 0 ? 0 : Math.max(...sessions.map((session) => session.zIndex))),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]">
        {sessions.map((session, cascadeIndex) => (
          <ShlEditorModalWindow
            key={session.id}
            session={session}
            cascadeIndex={cascadeIndex}
            onActivate={() => onActivateSession(session.id)}
            onCloseRequest={() => onCloseRequest(session.id)}
            onReloadRequest={() => onReloadRequest(session.id)}
            onDraftChange={(next) => onDraftChange(session.id, next)}
            onSave={() => onSave(session.id)}
            onReset={() => onReset(session.id)}
            skipActivate={session.zIndex >= topZIndex}
            viewportSuspend={viewportSuspend}
            modelFolderNames={modelFolderNames}
            bodySlotRequired={bodySlotRequired}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
