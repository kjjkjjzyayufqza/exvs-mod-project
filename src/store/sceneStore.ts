import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface BoxState {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
}

export interface SceneState {
    // Box management
    boxes: Record<string, BoxState>;

    // Selection
    selectedBoxId: string | null;

    // Transform mode
    transformMode: 'translate' | 'rotate' | 'scale';

    // History management
    history: BoxState[][];
    historyIndex: number;

    // Actions
    setSelectedBox: (boxId: string) => void;
    clearSelection: () => void;
    setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
    updateBoxTransform: (boxState: BoxState) => void;
    getInitialBoxState: (boxId: string) => BoxState | null;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

const initialBoxes: Record<string, BoxState> = {
    box1: { id: 'box1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    box2: { id: 'box2', position: [2, 1, -1], rotation: [0, 0, 0], scale: [1, 1, 1] }
};

const initialHistory: BoxState[][] = [Object.values(initialBoxes)];

export const useSceneStore = create<SceneState>()(
    immer((set, get) => ({
        // Initial state
        boxes: initialBoxes,
        selectedBoxId: 'box1',
        transformMode: 'translate',
        history: initialHistory,
        historyIndex: 0,

        // Actions
        setSelectedBox: (boxId: string) => {
            set((state) => {
                state.selectedBoxId = boxId;
            });
        },

        clearSelection: () => {
            set((state) => {
                state.selectedBoxId = null;
            });
        },

        setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => {
            set((state) => {
                state.transformMode = mode;
            });
        },

        updateBoxTransform: (boxState: BoxState) => {
            set((state) => {
                // Update the box
                state.boxes[boxState.id] = boxState;

                // Save to history
                const newHistoryState = Object.values(state.boxes);
                const newHistory = state.history.slice(0, state.historyIndex + 1);
                newHistory.push(newHistoryState);
                state.history = newHistory;
                state.historyIndex = newHistory.length - 1;
            });
        },

        getInitialBoxState: (boxId: string) => {
            return initialBoxes[boxId] || null;
        },

        undo: () => {
            set((state) => {
                if (state.historyIndex > 0) {
                    const newIndex = state.historyIndex - 1;
                    const previousState = state.history[newIndex];
                    const newBoxes = previousState.reduce((acc, box) => {
                        acc[box.id] = box;
                        return acc;
                    }, {} as Record<string, BoxState>);

                    state.boxes = newBoxes;
                    state.historyIndex = newIndex;
                }
            });
        },

        redo: () => {
            set((state) => {
                if (state.historyIndex < state.history.length - 1) {
                    const newIndex = state.historyIndex + 1;
                    const nextState = state.history[newIndex];
                    const newBoxes = nextState.reduce((acc, box) => {
                        acc[box.id] = box;
                        return acc;
                    }, {} as Record<string, BoxState>);

                    state.boxes = newBoxes;
                    state.historyIndex = newIndex;
                }
            });
        },

        canUndo: () => {
            return get().historyIndex > 0;
        },

        canRedo: () => {
            return get().historyIndex < get().history.length - 1;
        },
    }))
);
