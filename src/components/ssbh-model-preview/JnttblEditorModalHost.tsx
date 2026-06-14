import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JnttblEditorModalWindow, type JnttblEditorWindowSession } from "./JnttblEditorModalWindow";
import type { JnttblEditorDocument } from "./jnttblIoService";
import type { ModalViewportSuspendInteraction } from "./SsbhEditorModalWindowShell";

type JnttblEditorModalHostProps = {
  sessions: JnttblEditorWindowSession[];
  onRegisterZLayer: (sessionId: string, setZ: (z: number) => void) => () => void;
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: JnttblEditorDocument) => void;
  onSave: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function JnttblEditorModalHost({
  sessions,
  onRegisterZLayer,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
  viewportSuspend,
}: JnttblEditorModalHostProps) {
  const topZIndex = useMemo(
    () => Math.max(...sessions.map((session) => session.zIndex)),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]">
        {sessions.map((session, cascadeIndex) => (
          <JnttblEditorModalWindow
            key={session.id}
            session={session}
            cascadeIndex={cascadeIndex}
            onRegisterZLayer={onRegisterZLayer}
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
