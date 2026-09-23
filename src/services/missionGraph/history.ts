import { createGraph, type MissionGraph } from "./graph";
import { layoutGraph } from "./editor";

export interface GraphHistory {
  past: MissionGraph[];
  present: MissionGraph;
  future: MissionGraph[];
  revision: number;
  semanticRevision: number;
  savedRevision: number;
}

export function initialHistory(graph = layoutGraph(createGraph())): GraphHistory {
  return { past: [], present: graph, future: [], revision: 0, semanticRevision: 0, savedRevision: 0 };
}

export function pushHistory(history: GraphHistory, present: MissionGraph, semantic: boolean): GraphHistory {
  return {
    past: [...history.past.slice(-49), history.present],
    present,
    future: [],
    revision: history.revision + 1,
    semanticRevision: semantic ? history.semanticRevision + 1 : history.semanticRevision,
    savedRevision: history.savedRevision,
  };
}

export function travelHistory(history: GraphHistory, direction: "undo" | "redo"): GraphHistory {
  if (direction === "undo" && history.past.length) {
    return {
      past: history.past.slice(0, -1),
      present: history.past[history.past.length - 1],
      future: [history.present, ...history.future],
      revision: history.revision + 1,
      semanticRevision: history.semanticRevision + 1,
      savedRevision: history.savedRevision,
    };
  }
  if (direction === "redo" && history.future.length) {
    return {
      past: [...history.past, history.present],
      present: history.future[0],
      future: history.future.slice(1),
      revision: history.revision + 1,
      semanticRevision: history.semanticRevision + 1,
      savedRevision: history.savedRevision,
    };
  }
  return history;
}

export function markSaved(history: GraphHistory): GraphHistory {
  return { ...history, savedRevision: history.revision };
}

export function replaceHistory(graph: MissionGraph): GraphHistory {
  return { past: [], present: graph, future: [], revision: 0, semanticRevision: 0, savedRevision: 0 };
}

export const isDirty = (history: GraphHistory) => history.revision !== history.savedRevision;
