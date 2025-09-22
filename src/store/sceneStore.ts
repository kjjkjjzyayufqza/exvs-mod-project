import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { VdkConfig, VdkObjectInfo } from '../types/vdk';
import { loadVdkConfig, groupVdkObjects } from '../utils/vdkParser';

export type ModelType = 'box' | 'dae';

export interface ModelState {
    id: string;
    name: string;
    type: ModelType;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    isLocked?: boolean; // Whether the model is locked from selection and transformation
    // For external models
    filePath?: string;
    color?: string; // For box models
    // For DAE models with multiple geometries
    subModels?: SubModelState[];
}

export interface SubModelState {
    id: string;
    name: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    geometryIndex: number;
    texturePath?: string; // 贴图文件路径
    textureBlob?: string; // 贴图的blob URL
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

    // VDK Configuration
    vdkConfigs: VdkConfig[];
    vdkObjectInfos: Map<number, VdkObjectInfo>;
    isVdkLoading: boolean;
    vdkLoadingError: string | null;

    // Actions
    setSelectedModel: (modelId: string) => void;
    clearSelection: () => void;
    clearAllModels: () => void;
    removeModel: (modelId: string) => void;
    toggleModelLock: (modelId: string) => void;
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
    // Texture actions
    setSubModelTexture: (modelId: string, subModelId: string, texturePath: string) => Promise<void>;
    removeSubModelTexture: (modelId: string, subModelId: string) => void;

    // VDK Configuration actions
    loadVdkConfig: (filePath: string) => Promise<void>;
    applyVdkConfigToScene: () => Promise<void>;
    setVdkLoading: (loading: boolean) => void;
    setVdkLoadingError: (error: string | null) => void;
}

const initialModels: Record<string, ModelState> = {

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

        // VDK Configuration initial state
        vdkConfigs: [],
        vdkObjectInfos: new Map(),
        isVdkLoading: false,
        vdkLoadingError: null,

        // Actions
        setSelectedModel: (modelId: string) => {
            set((state) => {
                const model = state.models[modelId];
                // Allow selection if the model exists (even if locked)
                if (model) {
                    state.selectedModelId = modelId;
                }
            });
        },

        clearSelection: () => {
            set((state) => {
                state.selectedModelId = null;
            });
        },

        clearAllModels: () => {
            set((state) => {
                // Clear all models
                state.models = {};

                // Clear selection
                state.selectedModelId = null;

                // Reset history to initial empty state
                state.history = [[]];
                state.historyIndex = 0;

                // Clear loading states
                state.isLoading = false;
                state.loadingError = null;
            });
        },

        removeModel: (modelId: string) => {
            set((state) => {
                // Remove the model from the models record
                delete state.models[modelId];

                // Clear selection if the removed model was selected
                if (state.selectedModelId === modelId) {
                    state.selectedModelId = null;
                }

                // Save to history
                const newHistoryState = Object.values(state.models);
                const newHistory = state.history.slice(0, state.historyIndex + 1);
                newHistory.push(newHistoryState);
                state.history = newHistory;
                state.historyIndex = newHistory.length - 1;
            });
        },

        toggleModelLock: (modelId: string) => {
            set((state) => {
                const model = state.models[modelId];
                if (model) {
                    // Toggle the lock state
                    model.isLocked = !model.isLocked;
                    // Note: Lock/unlock operations are not saved to history
                }
            });
        },

        setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => {
            set((state) => {
                state.transformMode = mode;
            });
        },

        updateModelTransform: (modelState: ModelState) => {
            set((state) => {
                const model = state.models[modelState.id];
                // Only allow transformation if the model exists and is not locked
                if (model && !model.isLocked) {
                    // Update the model
                    state.models[modelState.id] = modelState;

                    // Save to history
                    const newHistoryState = Object.values(state.models);
                    const newHistory = state.history.slice(0, state.historyIndex + 1);
                    newHistory.push(newHistoryState);
                    state.history = newHistory;
                    state.historyIndex = newHistory.length - 1;
                }
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

                // Extract filename from path and generate unique model ID
                const fileName = selected.split(/[/\\]/).pop() || 'unknown.dae';
                const baseName = fileName.replace('.dae', '');
                const modelId = `dae_${baseName}_${Date.now()}`;
                const modelName = baseName;

                // Create model state
                const daeModelState: ModelState = {
                    id: modelId,
                    name: modelName,
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

                // Read file content
                const fileContent = await readFile(filePath);

                // Convert to text for DAE (XML) files
                const textContent = new TextDecoder().decode(fileContent);

                console.log('DAE file content length:', textContent.length);

                // Create blob URL for Three.js loader
                const blob = new Blob([textContent], { type: 'application/xml' });
                const blobUrl = URL.createObjectURL(blob);

                console.log('Created blob URL:', blobUrl);

                // Extract filename from path and generate unique model ID
                const fileName = filePath.split(/[/\\]/).pop() || 'unknown.dae';
                const baseName = fileName.replace('.dae', '');
                const modelId = `dae_${baseName}_${Date.now()}`;
                const modelName = baseName;

                // Create model state
                const daeModelState: ModelState = {
                    id: modelId,
                    name: modelName,
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

        // Texture actions implementation
        setSubModelTexture: async (modelId: string, subModelId: string, texturePath: string) => {
            try {
                // Read image file
                const fileContent = await readFile(texturePath);
                
                // Create blob URL for the texture
                const blob = new Blob([fileContent as BlobPart]);
                const blobUrl = URL.createObjectURL(blob);

                set((state) => {
                    const model = state.models[modelId];
                    if (model && model.subModels) {
                        const subModel = model.subModels.find(sm => sm.id === subModelId);
                        if (subModel) {
                            subModel.texturePath = texturePath;
                            subModel.textureBlob = blobUrl;
                        }
                    }

                    // Save to history
                    const newHistoryState = Object.values(state.models);
                    const newHistory = state.history.slice(0, state.historyIndex + 1);
                    newHistory.push(newHistoryState);
                    state.history = newHistory;
                    state.historyIndex = newHistory.length - 1;
                });

                console.log('Texture set successfully for subModel:', subModelId);

            } catch (error) {
                console.error('Failed to set texture:', error);
                set((state) => {
                    state.loadingError = error instanceof Error ? error.message : 'Failed to load texture';
                });
            }
        },

        removeSubModelTexture: (modelId: string, subModelId: string) => {
            set((state) => {
                const model = state.models[modelId];
                if (model && model.subModels) {
                    const subModel = model.subModels.find(sm => sm.id === subModelId);
                    if (subModel) {
                        // Clean up blob URL if it exists
                        if (subModel.textureBlob) {
                            URL.revokeObjectURL(subModel.textureBlob);
                        }
                        subModel.texturePath = undefined;
                        subModel.textureBlob = undefined;
                    }
                }

                // Save to history
                const newHistoryState = Object.values(state.models);
                const newHistory = state.history.slice(0, state.historyIndex + 1);
                newHistory.push(newHistoryState);
                state.history = newHistory;
                state.historyIndex = newHistory.length - 1;
            });

            console.log('Texture removed for subModel:', subModelId);
        },

        // VDK Configuration actions implementation
        loadVdkConfig: async (filePath: string) => {
            try {
                set((state) => {
                    state.isVdkLoading = true;
                    state.vdkLoadingError = null;
                });

                console.log('Loading VDK config from:', filePath);
                const configs = await loadVdkConfig(filePath);
                const objectInfos = groupVdkObjects(configs);

                set((state) => {
                    state.vdkConfigs = configs;
                    state.vdkObjectInfos = objectInfos;
                    state.isVdkLoading = false;
                });

                console.log('VDK config loaded successfully:', configs.length, 'configs,', objectInfos.size, 'unique objects');
            } catch (error) {
                console.error('Failed to load VDK config:', error);
                set((state) => {
                    state.vdkLoadingError = error instanceof Error ? error.message : 'Unknown error occurred';
                    state.isVdkLoading = false;
                });
            }
        },

        applyVdkConfigToScene: async () => {
            const state = get();
            const { vdkObjectInfos, models, addExternalModel } = state;

            console.log('Applying VDK config to scene...');

            // Process each VDK object info
            for (const [objectNumber, objectInfo] of vdkObjectInfos) {
                console.log(`Processing VDK object ${objectNumber}, count: ${objectInfo.count}`);

                // Find existing scene models that match this object number (add +1 to index)
                const sceneModels = Object.values(models).filter(model =>
                    model.name.startsWith('scene_') &&
                    model.name === `scene_${objectNumber + 1}`
                );

                if (sceneModels.length === 0) {
                    console.warn(`No scene model found for VDK object ${objectNumber}`);
                    continue;
                }

                const baseSceneModel = sceneModels[0];

                // Update the base model with VDK config
                const updatedModel: ModelState = {
                    ...baseSceneModel,
                    position: objectInfo.position,
                    rotation: objectInfo.rotation,
                };

                // Apply the update
                state.updateModelTransform(updatedModel);

                // If we need more instances than we have, create duplicates
                if (objectInfo.count > sceneModels.length) {
                    const instancesToCreate = objectInfo.count - sceneModels.length;
                    console.log(`Creating ${instancesToCreate} additional instances for object ${objectNumber}`);

                    for (let i = 0; i < instancesToCreate; i++) {
                        const duplicateId = `scene_${objectNumber}_duplicate_${i + 1}`;
                        const duplicateModel: ModelState = {
                            ...baseSceneModel,
                            id: duplicateId,
                            name: `scene_${objectNumber}_duplicate_${i + 1}`,
                            position: objectInfo.position,
                            rotation: objectInfo.rotation,
                        };

                        addExternalModel(duplicateModel);
                    }
                }
            }

            console.log('VDK config applied to scene successfully');
        },

        setVdkLoading: (loading: boolean) => {
            set((state) => {
                state.isVdkLoading = loading;
            });
        },

        setVdkLoadingError: (error: string | null) => {
            set((state) => {
                state.vdkLoadingError = error;
            });
        },
    }))
);
