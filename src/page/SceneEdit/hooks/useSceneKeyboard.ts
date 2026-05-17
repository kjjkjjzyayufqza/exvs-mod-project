import { useEffect } from "react";
import { useSceneEditorStore } from "../store/sceneEditorStore";

interface SceneKeyboardOptions {
  onDelete?: () => void;
  onDuplicate?: () => void;
  onPaste?: () => void;
  onFocus?: () => void;
  onSelectAll?: (ids: string[]) => void;
  onClearSelection?: () => void;
  allNodeIds?: string[];
}

export function useSceneKeyboard({
  onDelete,
  onDuplicate,
  onPaste,
  onFocus,
  onSelectAll,
  onClearSelection,
  allNodeIds = [],
}: SceneKeyboardOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (ctrl && e.key === "z" && !shift) {
        e.preventDefault();
        useSceneEditorStore.getState().undo();
        return;
      }

      if ((ctrl && e.key === "z" && shift) || (ctrl && e.key === "y")) {
        e.preventDefault();
        useSceneEditorStore.getState().redo();
        return;
      }

      if (ctrl && e.key === "a") {
        e.preventDefault();
        if (allNodeIds.length > 0) {
          useSceneEditorStore.getState().selectAll(allNodeIds);
        }
        onSelectAll?.(allNodeIds);
        return;
      }

      if (ctrl && e.key === "d") {
        e.preventDefault();
        onDuplicate?.();
        return;
      }

      if (ctrl && e.key === "c") {
        e.preventDefault();
        const store = useSceneEditorStore.getState();
        const ids = store.getSelectedIds();
        const entries = ids.map((id) => ({
          nodeId: id,
          placementIdx: null,
          transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        }));
        store.copyToClipboard(entries);
        return;
      }

      if (ctrl && e.key === "v") {
        e.preventDefault();
        onPaste?.();
        return;
      }

      if (ctrl && e.key === "g") {
        e.preventDefault();
        const store = useSceneEditorStore.getState();
        const ids = store.getSelectedIds();
        if (ids.length >= 2) {
          store.createGroup(`Group ${store.groups.length + 1}`, ids);
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete?.();
        return;
      }

      if (e.key === "f" || e.key === "F") {
        if (ctrl) return;
        e.preventDefault();
        onFocus?.();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        useSceneEditorStore.getState().deselectAll();
        onClearSelection?.();
        return;
      }

      if (e.key === "h" || e.key === "H") {
        if (ctrl) return;
        e.preventDefault();
        const store = useSceneEditorStore.getState();
        const ids = store.getSelectedIds();
        ids.forEach((id) => store.toggleVisibility(id));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDelete, onDuplicate, onPaste, onFocus, onSelectAll, onClearSelection, allNodeIds]);
}
