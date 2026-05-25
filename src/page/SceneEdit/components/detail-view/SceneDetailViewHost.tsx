import { useMemo } from "react";
import type { DetailViewSession, DetailViewModelTab, DetailViewModelData } from "./sceneDetailViewTypes";
import { SceneDetailViewWindow } from "./SceneDetailViewWindow";
import { EffectDetailViewWindow } from "./EffectDetailViewWindow";
import type { NumdlbReadResult, NuhlpbReadResult } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import type { NumatbModalBundle } from "@/page/TestEditor/components/ssbh-model-preview/numatbEditorUtils";

type SceneDetailViewHostProps = {
  sessions: DetailViewSession[];
  onActivateSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onTabChange: (sessionId: string, tab: DetailViewModelTab) => void;
  onNumdlbDraftChange: (sessionId: string, draft: NumdlbReadResult) => void;
  onNumdlbSave: (sessionId: string) => void;
  onNumatbDraftChange: (sessionId: string, draft: NumatbModalBundle) => void;
  onNumatbSave: (sessionId: string) => void;
  onNuhlpbDraftChange: (sessionId: string, draft: NuhlpbReadResult) => void;
  onNuhlpbSave: (sessionId: string) => void;
};

export function SceneDetailViewHost({
  sessions,
  onActivateSession,
  onCloseSession,
  onTabChange,
  onNumdlbDraftChange,
  onNumdlbSave,
  onNumatbDraftChange,
  onNumatbSave,
  onNuhlpbDraftChange,
  onNuhlpbSave,
}: SceneDetailViewHostProps) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.zIndex - b.zIndex),
    [sessions],
  );
  const topZIndex = useMemo(
    () => sessions.reduce((max, session) => Math.max(max, session.zIndex), 0),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-60">
      {sorted.map((session, cascadeIndex) => {
        if (session.kind === "effect") {
          return (
            <EffectDetailViewWindow
              key={session.id}
              session={session}
              cascadeIndex={cascadeIndex}
              skipActivate={session.zIndex >= topZIndex}
              onActivate={() => onActivateSession(session.id)}
              onClose={() => onCloseSession(session.id)}
            />
          );
        }
        return (
          <SceneDetailViewWindow
            key={session.id}
            session={session}
            cascadeIndex={cascadeIndex}
            skipActivate={session.zIndex >= topZIndex}
            onActivate={() => onActivateSession(session.id)}
            onClose={() => onCloseSession(session.id)}
            onTabChange={(tab) => onTabChange(session.id, tab)}
            onNumdlbDraftChange={(draft) => onNumdlbDraftChange(session.id, draft)}
            onNumdlbSave={() => onNumdlbSave(session.id)}
            onNumatbDraftChange={(draft) => onNumatbDraftChange(session.id, draft)}
            onNumatbSave={() => onNumatbSave(session.id)}
            onNuhlpbDraftChange={(draft) => onNuhlpbDraftChange(session.id, draft)}
            onNuhlpbSave={() => onNuhlpbSave(session.id)}
          />
        );
      })}
    </div>
  );
}
