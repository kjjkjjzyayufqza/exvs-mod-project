import { useCallback, useRef } from "react";

export interface SceneCommand {
  type: string;
  execute: () => void;
  undo: () => void;
  description: string;
}

export interface SceneHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
}

export interface SceneHistoryActions {
  execute: (command: SceneCommand) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  getState: () => SceneHistoryState;
}

const MAX_HISTORY = 100;

export function useSceneHistory(): SceneHistoryActions {
  const undoStack = useRef<SceneCommand[]>([]);
  const redoStack = useRef<SceneCommand[]>([]);

  const execute = useCallback((command: SceneCommand) => {
    command.execute();
    undoStack.current.push(command);
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    const command = undoStack.current.pop();
    if (!command) return;
    command.undo();
    redoStack.current.push(command);
  }, []);

  const redo = useCallback(() => {
    const command = redoStack.current.pop();
    if (!command) return;
    command.execute();
    undoStack.current.push(command);
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
  }, []);

  const getState = useCallback((): SceneHistoryState => {
    const uStack = undoStack.current;
    const rStack = redoStack.current;
    return {
      canUndo: uStack.length > 0,
      canRedo: rStack.length > 0,
      undoDescription: uStack.length > 0 ? uStack[uStack.length - 1].description : null,
      redoDescription: rStack.length > 0 ? rStack[rStack.length - 1].description : null,
    };
  }, []);

  return { execute, undo, redo, clear, getState };
}
