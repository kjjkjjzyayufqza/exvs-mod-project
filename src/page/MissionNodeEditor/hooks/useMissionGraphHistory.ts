import { useCallback, useMemo, useState } from "react";
import { initialHistory, isDirty, markSaved, pushHistory, replaceHistory, travelHistory, type GraphHistory } from "@/services/missionGraph/history";
import type { MissionGraph } from "@/services/missionGraph/graph";

export function useMissionGraphHistory() {
  const [history, setHistory] = useState<GraphHistory>(initialHistory);
  const change = useCallback((next: MissionGraph, semantic = true) => {
    setHistory((current) => pushHistory(current, next, semantic));
  }, []);
  const travel = useCallback((direction: "undo" | "redo") => {
    setHistory((current) => travelHistory(current, direction));
  }, []);
  const replace = useCallback((graph: MissionGraph) => {
    setHistory(replaceHistory(graph));
  }, []);
  const saveCheckpoint = useCallback(() => setHistory(markSaved), []);
  return useMemo(() => ({
    history, graph: history.present, dirty: isDirty(history), change, travel, replace, saveCheckpoint,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
  }), [change, history, replace, saveCheckpoint, travel]);
}
