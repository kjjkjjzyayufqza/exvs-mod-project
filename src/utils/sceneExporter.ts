import { ModelState, SubModelState, SceneState } from '../store/sceneStore';
import { VdkConfig, VdkObjectInfo } from '../types/vdk';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';

// 导出的场景数据格式
export interface ExportedSceneData {
    name: string;
    timestamp: string;
    version: string;
    data: ExportedModelData[];
    vdkConfigs?: VdkConfig[];
    vdkObjectInfos?: Record<number, VdkObjectInfo>;
}

// 导出的模型数据格式
export interface ExportedModelData {
    id: string;
    name: string;
    type: 'box' | 'dae';
    index: number;
    
    // 变换属性
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    
    // 锁定状态
    isLocked?: boolean;
    
    // 模型文件路径（完整路径）
    modelFilePath?: string;
    
    // Box模型颜色
    color?: string;
    
    // 子模型数据
    subModels?: ExportedSubModelData[];
}

// 导出的子模型数据格式
export interface ExportedSubModelData {
    id: string;
    name: string;
    geometryIndex: number;
    
    // 变换属性
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    
    // 贴图路径（完整路径）
    texturePath?: string;
}

/**
 * 将SceneState转换为可导出的JSON数据
 */
export function convertSceneStateToExportData(
    sceneState: SceneState,
    sceneName: string = 'Untitled Scene'
): ExportedSceneData {
    const models = Object.values(sceneState.models);
    
    const exportedModels: ExportedModelData[] = models.map((model, index) => {
        const exportedModel: ExportedModelData = {
            id: model.id,
            name: model.name,
            type: model.type as 'box' | 'dae',
            index: index,
            position: model.position,
            rotation: model.rotation,
            scale: model.scale,
            isLocked: model.isLocked,
            color: model.color
        };

        // 处理模型文件路径 - 优先使用原始文件路径
        if (model.originalFilePath) {
            // 使用原始文件路径
            exportedModel.modelFilePath = model.originalFilePath;
        } else if (model.filePath) {
            // 如果没有原始路径，使用filePath（可能是blob URL）
            if (model.filePath.startsWith('blob:')) {
                console.warn(`Model ${model.name} uses a blob URL and cannot be fully exported`);
                exportedModel.modelFilePath = `[BLOB_URL]${model.filePath}`;
            } else {
                exportedModel.modelFilePath = model.filePath;
            }
        }

        // 处理子模型
        if (model.subModels && model.subModels.length > 0) {
            exportedModel.subModels = model.subModels.map(subModel => ({
                id: subModel.id,
                name: subModel.name,
                geometryIndex: subModel.geometryIndex,
                position: subModel.position,
                rotation: subModel.rotation,
                scale: subModel.scale,
                texturePath: subModel.texturePath
            }));
        }

        return exportedModel;
    });

    // 转换VdkObjectInfos Map为普通对象
    const vdkObjectInfosRecord: Record<number, VdkObjectInfo> = {};
    if (sceneState.vdkObjectInfos) {
        for (const [key, value] of sceneState.vdkObjectInfos.entries()) {
            vdkObjectInfosRecord[key] = value;
        }
    }

    return {
        name: sceneName,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: exportedModels,
        vdkConfigs: sceneState.vdkConfigs.length > 0 ? sceneState.vdkConfigs : undefined,
        vdkObjectInfos: Object.keys(vdkObjectInfosRecord).length > 0 ? vdkObjectInfosRecord : undefined
    };
}

/**
 * 将导出的JSON数据转换回SceneState格式
 */
export function convertExportDataToSceneState(exportedData: ExportedSceneData): {
    models: Record<string, ModelState>;
    vdkConfigs: VdkConfig[];
    vdkObjectInfos: Map<number, VdkObjectInfo>;
} {
    const models: Record<string, ModelState> = {};

    exportedData.data.forEach(exportedModel => {
        const model: ModelState = {
            id: exportedModel.id,
            name: exportedModel.name,
            type: exportedModel.type,
            position: exportedModel.position,
            rotation: exportedModel.rotation,
            scale: exportedModel.scale,
            isLocked: exportedModel.isLocked,
            color: exportedModel.color
        };

        // 处理模型文件路径
        if (exportedModel.modelFilePath) {
            if (exportedModel.modelFilePath.startsWith('[BLOB_URL]')) {
                // 这是一个blob URL，需要用户重新加载模型
                console.warn(`Model ${model.name} had a blob URL and needs to be reloaded manually`);
                model.filePath = exportedModel.modelFilePath.replace('[BLOB_URL]', '');
            } else {
                // 保存原始文件路径，filePath将在导入后重新创建blob URL
                model.originalFilePath = exportedModel.modelFilePath;
                // 暂时将filePath设为原始路径，稍后会被重新加载为blob URL
                model.filePath = exportedModel.modelFilePath;
            }
        }

        // 处理子模型
        if (exportedModel.subModels && exportedModel.subModels.length > 0) {
            model.subModels = exportedModel.subModels.map(exportedSubModel => ({
                id: exportedSubModel.id,
                name: exportedSubModel.name,
                geometryIndex: exportedSubModel.geometryIndex,
                position: exportedSubModel.position,
                rotation: exportedSubModel.rotation,
                scale: exportedSubModel.scale,
                texturePath: exportedSubModel.texturePath
                // textureBlob 需要重新加载
            }));
        }

        models[model.id] = model;
    });

    // 转换VdkObjectInfos回Map格式
    const vdkObjectInfos = new Map<number, VdkObjectInfo>();
    if (exportedData.vdkObjectInfos) {
        for (const [key, value] of Object.entries(exportedData.vdkObjectInfos)) {
            vdkObjectInfos.set(Number(key), value);
        }
    }

    return {
        models,
        vdkConfigs: exportedData.vdkConfigs || [],
        vdkObjectInfos
    };
}

/**
 * 导出场景状态到JSON文件
 */
export async function exportSceneToFile(
    sceneState: SceneState,
    sceneName?: string
): Promise<void> {
    try {
        // 让用户选择保存位置
        const filePath = await save({
            filters: [{
                name: 'Scene Files',
                extensions: ['json']
            }],
            defaultPath: `${sceneName || 'scene'}_${new Date().toISOString().slice(0, 10)}.json`
        });

        if (!filePath) {
            console.log('Export cancelled by user');
            return;
        }

        // 转换场景状态为导出格式
        const exportData = convertSceneStateToExportData(sceneState, sceneName);

        // 写入文件
        const jsonString = JSON.stringify(exportData, null, 2);
        await writeTextFile(filePath, jsonString);

        console.log('Scene exported successfully to:', filePath);
        
        // 返回成功信息
        return;
    } catch (error) {
        console.error('Failed to export scene:', error);
        throw new Error(`导出场景失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
}

/**
 * 从JSON文件导入场景状态
 */
export async function importSceneFromFile(): Promise<{
    models: Record<string, ModelState>;
    vdkConfigs: VdkConfig[];
    vdkObjectInfos: Map<number, VdkObjectInfo>;
    sceneName: string;
    timestamp: string;
} | null> {
    try {
        // 让用户选择文件
        const filePath = await open({
            multiple: false,
            filters: [{
                name: 'Scene Files',
                extensions: ['json']
            }]
        });

        if (!filePath) {
            console.log('Import cancelled by user');
            return null;
        }

        // 读取文件内容
        const jsonString = await readTextFile(filePath);
        const exportedData: ExportedSceneData = JSON.parse(jsonString);

        // 验证数据格式
        if (!exportedData.data || !Array.isArray(exportedData.data)) {
            throw new Error('无效的场景文件格式');
        }

        // 转换为场景状态格式
        const { models, vdkConfigs, vdkObjectInfos } = convertExportDataToSceneState(exportedData);

        console.log('Scene imported successfully from:', filePath);
        console.log('Imported models:', Object.keys(models).length);
        console.log('Imported VDK configs:', vdkConfigs.length);

        return {
            models,
            vdkConfigs,
            vdkObjectInfos,
            sceneName: exportedData.name,
            timestamp: exportedData.timestamp
        };
    } catch (error) {
        console.error('Failed to import scene:', error);
        throw new Error(`导入场景失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
}

/**
 * 验证导出数据的完整性
 */
export function validateExportData(exportedData: ExportedSceneData): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
} {
    const warnings: string[] = [];
    const errors: string[] = [];

    // 检查基本结构
    if (!exportedData.name) {
        warnings.push('场景名称为空');
    }

    if (!exportedData.data || !Array.isArray(exportedData.data)) {
        errors.push('缺少模型数据');
        return { isValid: false, warnings, errors };
    }

    // 检查每个模型
    exportedData.data.forEach((model, index) => {
        if (!model.id) {
            errors.push(`模型 ${index} 缺少ID`);
        }

        if (!model.name) {
            warnings.push(`模型 ${model.id || index} 缺少名称`);
        }

        if (model.modelFilePath && model.modelFilePath.startsWith('[BLOB_URL]')) {
            warnings.push(`模型 ${model.name} 使用了临时文件路径，导入后需要重新加载`);
        }

        // 检查子模型
        if (model.subModels) {
            model.subModels.forEach((subModel, subIndex) => {
                if (!subModel.id) {
                    errors.push(`模型 ${model.name} 的子模型 ${subIndex} 缺少ID`);
                }
            });
        }
    });

    return {
        isValid: errors.length === 0,
        warnings,
        errors
    };
}
