import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JnttblEditorModalWindow, type JnttblEditorWindowSession } from "./JnttblEditorModalWindow";
import type { JnttblEditorDocument } from "./jnttblIoService";

type JnttblEditorModalHostProps = {
  sessions: JnttblEditorWindowSession[];
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: JnttblEditorDocument) => void;
  onSave: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
};

export function JnttblEditorModalHost({
  sessions,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
}: JnttblEditorModalHostProps) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.zIndex - b.zIndex),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="pointer-events-none fixed inset-0 z-[61]">
        {sorted.map((session, cascadeIndex) => (
          <JnttblEditorModalWindow
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
