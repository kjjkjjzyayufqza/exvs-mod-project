import { TooltipProvider } from "@/components/ui/tooltip";
import {
  EffectProjectEditorModalWindow,
  type EffectProjectEditorWindowSession,
} from "./EffectProjectEditorModalWindow";
import type { EffectProjectEditorDocument } from "./effectProjectEditorUtils";

type Props = {
  sessions: EffectProjectEditorWindowSession[];
  onRegisterZLayer: (sessionId: string, setZ: (z: number) => void) => () => void;
  onActivateSession: (sessionId: string) => void;
  onCloseRequest: (sessionId: string) => void;
  onReloadRequest: (sessionId: string) => void;
  onDraftChange: (sessionId: string, next: EffectProjectEditorDocument) => void;
  onSave: (sessionId: string, document: EffectProjectEditorDocument) => void;
  onReset: (sessionId: string) => void;
};

export function EffectProjectEditorModalHost({
  sessions,
  onRegisterZLayer,
  onActivateSession,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
}: Props) {
  if (sessions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]">
        {sessions.map((session, cascadeIndex) => (
          <EffectProjectEditorModalWindow
            key={session.id}
            session={session}
            cascadeIndex={cascadeIndex}
            onRegisterZLayer={onRegisterZLayer}
            onActivate={() => onActivateSession(session.id)}
            onCloseRequest={() => onCloseRequest(session.id)}
            onReloadRequest={() => onReloadRequest(session.id)}
            onDraftChange={(next) => onDraftChange(session.id, next)}
            onSave={(document) => onSave(session.id, document)}
            onReset={() => onReset(session.id)}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
