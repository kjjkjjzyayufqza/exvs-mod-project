import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NumdlbEditorModalWindow, type NumdlbEditorWindowSession } from "./NumdlbEditorModalWindow";
import type { NumdlbReadResult } from "./ssbhDaeIoService";

type NumdlbEditorModalHostProps = {
  sessions: NumdlbEditorWindowSession[];
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: NumdlbReadResult) => void;
  onSave: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
};

export function NumdlbEditorModalHost({
  sessions,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
}: NumdlbEditorModalHostProps) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.zIndex - b.zIndex),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      {/* Above base modals; offset below the top bar so it can never cover it */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]">
        {sorted.map((session, cascadeIndex) => (
          <NumdlbEditorModalWindow
            key={session.id}
            session={session}
            cascadeIndex={cascadeIndex}
            onActivate={() => onActivateSession(session.id)}
            onCloseRequest={() => onCloseRequest(session.id)}
            onReloadRequest={() => onReloadRequest(session.id)}
            onDraftChange={(next) => onDraftChange(session.id, next)}
            onSave={() => onSave(session.id)}
            onReset={() => onReset(session.id)}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
