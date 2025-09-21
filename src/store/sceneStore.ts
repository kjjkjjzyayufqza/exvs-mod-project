import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type ModelType = 'box' | 'dae';

export interface ModelState {
    id: string;
    type: ModelType;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    // For external models
    filePath?: string;
    color?: string; // For box models
}

export interface SceneState {
    // Model management
    models: Record<string, ModelState>;

    // External model loading
    isLoading: boolean;
    loadingError: string | null;

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
    addExternalModel: (modelState: ModelState) => void;
    loadDAEModelFromFile: () => Promise<void>;
    loadSpecificDAEModel: (filePath: string) => Promise<void>;
    setLoading: (loading: boolean) => void;
    setLoadingError: (error: string | null) => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

const initialModels: Record<string, ModelState> = {
    box1: { id: 'box1', type: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: 'orange' },
    box2: { id: 'box2', type: 'box', position: [2, 1, -1], rotation: [0, 0, 0], scale: [1, 1, 1], color: 'blue' }
};

const initialHistory: ModelState[][] = [Object.values(initialModels)];

export const useSceneStore = create<SceneState>()(
    immer((set, get) => ({
        // Initial state
        models: initialModels,
        isLoading: false,
        loadingError: null,
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

        addExternalModel: (modelState: ModelState) => {
            set((state) => {
                state.models[modelState.id] = modelState;

                // Save to history
                const newHistoryState = Object.values(state.models);
                const newHistory = state.history.slice(0, state.historyIndex + 1);
                newHistory.push(newHistoryState);
                state.history = newHistory;
                state.historyIndex = newHistory.length - 1;
            });
        },

        loadDAEModelFromFile: async () => {
            try {
                // Set loading state
                set((state) => {
                    state.isLoading = true;
                    state.loadingError = null;
                });

                // Import Tauri dialog at runtime to avoid bundling issues
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { readFile } = await import('@tauri-apps/plugin-fs');

                // Open file dialog to select DAE file
                const selected = await open({
                    multiple: false,
                    filters: [{
                        name: 'DAE Files',
                        extensions: ['dae']
                    }]
                });

                if (!selected) {
                    set((state) => {
                        state.isLoading = false;
                    });
                    return;
                }

                console.log('Selected DAE file:', selected);

                // Read file content
                const fileContent = await readFile(selected);
                
                // Convert to text for DAE (XML) files
                const textContent = new TextDecoder().decode(fileContent);
                
                console.log('DAE file content length:', textContent.length);
                
                // Create blob URL for Three.js loader
                const blob = new Blob([textContent], { type: 'application/xml' });
                const blobUrl = URL.createObjectURL(blob);

                console.log('Created blob URL:', blobUrl);

                // Generate unique model ID
                const modelId = `dae_model_${Date.now()}`;

                // Create model state
                const daeModelState: ModelState = {
                    id: modelId,
                    type: 'dae',
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    filePath: blobUrl
                };

                console.log('Adding DAE model:', daeModelState);

                // Add model to scene and set as selected
                set((state) => {
                    state.models[modelId] = daeModelState;
                    state.selectedModelId = modelId;
                    state.isLoading = false;

                    // Save to history
                    const newHistoryState = Object.values(state.models);
                    const newHistory = state.history.slice(0, state.historyIndex + 1);
                    newHistory.push(newHistoryState);
                    state.history = newHistory;
                    state.historyIndex = newHistory.length - 1;
                });

                console.log('DAE model added successfully');

            } catch (error) {
                console.error('Failed to load DAE model:', error);
                set((state) => {
                    state.loadingError = error instanceof Error ? error.message : 'Unknown error occurred';
                    state.isLoading = false;
                });
            }
        },

        loadSpecificDAEModel: async (filePath: string) => {
            try {
                // Set loading state
                set((state) => {
                    state.isLoading = true;
                    state.loadingError = null;
                });

                console.log('Loading specific DAE file:', filePath);

                // Import Tauri fs at runtime
                const { readFile } = await import('@tauri-apps/plugin-fs');

                // Read file content
                const fileContent = await readFile(filePath);
                
                // Convert to text for DAE (XML) files
                const textContent = new TextDecoder().decode(fileContent);
                
                console.log('DAE file content length:', textContent.length);
                
                // Create blob URL for Three.js loader
                const blob = new Blob([textContent], { type: 'application/xml' });
                const blobUrl = URL.createObjectURL(blob);

                console.log('Created blob URL:', blobUrl);

                // Generate unique model ID
                const modelId = `dae_model_${Date.now()}`;

                // Create model state
                const daeModelState: ModelState = {
                    id: modelId,
                    type: 'dae',
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    filePath: blobUrl
                };

                console.log('Adding DAE model:', daeModelState);

                // Add model to scene and set as selected
                set((state) => {
                    state.models[modelId] = daeModelState;
                    state.selectedModelId = modelId;
                    state.isLoading = false;

                    // Save to history
                    const newHistoryState = Object.values(state.models);
                    const newHistory = state.history.slice(0, state.historyIndex + 1);
                    newHistory.push(newHistoryState);
                    state.history = newHistory;
                    state.historyIndex = newHistory.length - 1;
                });

                console.log('DAE model added successfully');

            } catch (error) {
                console.error('Failed to load specific DAE model:', error);
                set((state) => {
                    state.loadingError = error instanceof Error ? error.message : 'Unknown error occurred';
                    state.isLoading = false;
                });
            }
        },

        setLoading: (loading: boolean) => {
            set((state) => {
                state.isLoading = loading;
            });
        },

        setLoadingError: (error: string | null) => {
            set((state) => {
                state.loadingError = error;
            });
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
