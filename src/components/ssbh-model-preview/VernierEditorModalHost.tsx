import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  VernierEditorModalWindow,
  type VernierEditorWindowSession,
} from "./VernierEditorModalWindow";
import type { TypedParamFile } from "./vernierIoService";
import type { ModalViewportSuspendInteraction } from "./SsbhEditorModalWindowShell";

type VernierEditorModalHostProps = {
  sessions: VernierEditorWindowSession[];
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: TypedParamFile) => void;
  onSave: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function VernierEditorModalHost({
  sessions,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
  viewportSuspend,
}: VernierEditorModalHostProps) {
  const topZIndex = useMemo(
    () => (sessions.length === 0 ? 0 : Math.max(...sessions.map((session) => session.zIndex))),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]">
        {sessions.map((session, cascadeIndex) => (
          <VernierEditorModalWindow
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
