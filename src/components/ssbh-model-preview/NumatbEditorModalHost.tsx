import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NumatbEditorModalWindow, type NumatbEditorWindowSession } from "./NumatbEditorModalWindow";
import type { NumatbModalBundle } from "./numatbEditorUtils";
import type { ModalViewportSuspendInteraction } from "./SsbhEditorModalWindowShell";

type NumatbEditorModalHostProps = {
  sessions: NumatbEditorWindowSession[];
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: NumatbModalBundle) => void;
  onSave: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function NumatbEditorModalHost({
  sessions,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
  viewportSuspend,
}: NumatbEditorModalHostProps) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.zIndex - b.zIndex),
    [sessions],
  );
  const topZIndex = useMemo(
    () => Math.max(...sessions.map((session) => session.zIndex)),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]">
        {sorted.map((session, cascadeIndex) => (
          <NumatbEditorModalWindow
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
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
