import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface ModelState {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
}

export interface SceneState {
    // Model management
    models: Record<string, ModelState>;

    // Selection
    selectedModelId: string | null;

    // Transform mode
    transformMode: 'translate' | 'rotate' | 'scale';

    // History management
    history: ModelState[][];
    historyIndex: number;

    // Actions
    setSelectedModel: (modelId: string) => void;
    clearSelection: () => void;
    setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
    updateModelTransform: (modelState: ModelState) => void;
    getInitialModelState: (modelId: string) => ModelState | null;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

const initialModels: Record<string, ModelState> = {
    box1: { id: 'box1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    box2: { id: 'box2', position: [2, 1, -1], rotation: [0, 0, 0], scale: [1, 1, 1] }
};

const initialHistory: ModelState[][] = [Object.values(initialModels)];

export const useSceneStore = create<SceneState>()(
    immer((set, get) => ({
        // Initial state
        models: initialModels,
        selectedModelId: 'box1',
        transformMode: 'translate',
        history: initialHistory,
        historyIndex: 0,

        // Actions
        setSelectedModel: (modelId: string) => {
            set((state) => {
                state.selectedModelId = modelId;
            });
        },

        clearSelection: () => {
            set((state) => {
                state.selectedModelId = null;
            });
        },

        setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => {
            set((state) => {
                state.transformMode = mode;
            });
        },

        updateModelTransform: (modelState: ModelState) => {
            set((state) => {
                // Update the model
                state.models[modelState.id] = modelState;

                // Save to history
                const newHistoryState = Object.values(state.models);
                const newHistory = state.history.slice(0, state.historyIndex + 1);
                newHistory.push(newHistoryState);
                state.history = newHistory;
                state.historyIndex = newHistory.length - 1;
            });
        },

        getInitialModelState: (modelId: string) => {
            return initialModels[modelId] || null;
        },

        undo: () => {
            set((state) => {
                if (state.historyIndex > 0) {
                    const newIndex = state.historyIndex - 1;
                    const previousState = state.history[newIndex];
                    const newModels = previousState.reduce((acc, model) => {
                        acc[model.id] = model;
                        return acc;
                    }, {} as Record<string, ModelState>);

                    state.models = newModels;
                    state.historyIndex = newIndex;
                }
            });
        },

        redo: () => {
            set((state) => {
                if (state.historyIndex < state.history.length - 1) {
                    const newIndex = state.historyIndex + 1;
                    const nextState = state.history[newIndex];
                    const newModels = nextState.reduce((acc, model) => {
                        acc[model.id] = model;
                        return acc;
                    }, {} as Record<string, ModelState>);

                    state.models = newModels;
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
