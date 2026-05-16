import { useState, useCallback } from "react";

export interface SceneSelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  anchorId: string | null;
}

export interface SceneSelectionActions {
  select: (id: string, opts?: { shift?: boolean; ctrl?: boolean }) => void;
  selectAll: (ids: string[]) => void;
  deselect: (id: string) => void;
  deselectAll: () => void;
  isSelected: (id: string) => boolean;
  getSelectedIds: () => string[];
  getPrimarySelectedId: () => string | null;
}

export function useSceneSelection(): [SceneSelectionState, SceneSelectionActions] {
  const [state, setState] = useState<SceneSelectionState>({
    selectedIds: new Set(),
    lastSelectedId: null,
    anchorId: null,
  });

  const select = useCallback(
    (id: string, opts?: { shift?: boolean; ctrl?: boolean }) => {
      setState((prev) => {
        if (opts?.ctrl) {
          const next = new Set(prev.selectedIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return {
            selectedIds: next,
            lastSelectedId: id,
            anchorId: prev.anchorId ?? id,
          };
        }
        if (opts?.shift && prev.anchorId) {
          return {
            ...prev,
            selectedIds: new Set([...prev.selectedIds, id]),
            lastSelectedId: id,
          };
        }
        return {
          selectedIds: new Set([id]),
          lastSelectedId: id,
          anchorId: id,
        };
      });
    },
    [],
  );

  const selectAll = useCallback((ids: string[]) => {
    setState({
      selectedIds: new Set(ids),
      lastSelectedId: ids.length > 0 ? ids[ids.length - 1] : null,
      anchorId: ids.length > 0 ? ids[0] : null,
    });
  }, []);

  const deselect = useCallback((id: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedIds);
      next.delete(id);
      return {
        selectedIds: next,
        lastSelectedId: next.size > 0 ? [...next][next.size - 1] : null,
        anchorId: prev.anchorId === id ? null : prev.anchorId,
      };
    });
  }, []);

  const deselectAll = useCallback(() => {
    setState({
      selectedIds: new Set(),
      lastSelectedId: null,
      anchorId: null,
    });
  }, []);

  const isSelected = useCallback(
    (id: string) => state.selectedIds.has(id),
    [state.selectedIds],
  );

  const getSelectedIds = useCallback(
    () => [...state.selectedIds],
    [state.selectedIds],
  );

  const getPrimarySelectedId = useCallback(
    () => state.lastSelectedId,
    [state.lastSelectedId],
  );

  return [state, { select, selectAll, deselect, deselectAll, isSelected, getSelectedIds, getPrimarySelectedId }];
}
