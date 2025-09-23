import React, { useState } from 'react';
import { useSceneStore } from '../../../store/sceneStore';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';
import { Download, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

export function SceneExportPanel() {
    const {
        models,
        vdkConfigs,
        vdkObjectInfos,
        isLoading,
        loadingError,
        exportScene,
        importScene
    } = useSceneStore();

    const [sceneName, setSceneName] = useState('');
    const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    const modelCount = Object.keys(models).length;
    const vdkConfigCount = vdkConfigs.length;
    const vdkObjectCount = vdkObjectInfos.size;

    const handleExport = async () => {
        try {
            setExportStatus('idle');
            setStatusMessage('');
            
            const exportName = sceneName.trim() || `Scene_${new Date().toISOString().slice(0, 10)}`;
            await exportScene(exportName);
            
            setExportStatus('success');
            setStatusMessage(`场景 "${exportName}" 导出成功！`);
            
            // Clear success message after 3 seconds
            setTimeout(() => {
                setExportStatus('idle');
                setStatusMessage('');
            }, 3000);
        } catch (error) {
            setExportStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '导出失败');
        }
    };

    const handleImport = async () => {
        try {
            setImportStatus('idle');
            setStatusMessage('');
            
            await importScene();
            
            setImportStatus('success');
            setStatusMessage('场景导入成功！');
            
            // Clear success message after 3 seconds
            setTimeout(() => {
                setImportStatus('idle');
                setStatusMessage('');
            }, 3000);
        } catch (error) {
            setImportStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '导入失败');
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    场景导出/导入
                </CardTitle>
                <CardDescription>
                    导出当前场景状态到JSON文件，或从JSON文件导入场景
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Current Scene Info */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">当前场景信息</Label>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                            <span className="font-semibold text-lg">{modelCount}</span>
                            <span className="text-muted-foreground">模型</span>
                        </div>
                        <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                            <span className="font-semibold text-lg">{vdkConfigCount}</span>
                            <span className="text-muted-foreground">VDK配置</span>
                        </div>
                        <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                            <span className="font-semibold text-lg">{vdkObjectCount}</span>
                            <span className="text-muted-foreground">VDK对象</span>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Export Section */}
                <div className="space-y-4">
                    <Label className="text-sm font-medium">导出场景</Label>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="sceneName" className="text-sm">
                                场景名称 (可选)
                            </Label>
                            <Input
                                id="sceneName"
                                placeholder="输入场景名称..."
                                value={sceneName}
                                onChange={(e) => setSceneName(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <Button
                            onClick={handleExport}
                            disabled={isLoading || modelCount === 0}
                            className="w-full"
                            variant="default"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            {isLoading ? '导出中...' : '导出场景'}
                        </Button>
                        {modelCount === 0 && (
                            <p className="text-sm text-muted-foreground">
                                场景中没有模型，无法导出
                            </p>
                        )}
                    </div>
                </div>

                <Separator />

                {/* Import Section */}
                <div className="space-y-4">
                    <Label className="text-sm font-medium">导入场景</Label>
                    <div className="space-y-3">
                        <Button
                            onClick={handleImport}
                            disabled={isLoading}
                            className="w-full"
                            variant="outline"
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            {isLoading ? '导入中...' : '导入场景'}
                        </Button>
                        <div className="text-sm text-muted-foreground space-y-1">
                            <p>• 导入将替换当前场景中的所有内容</p>
                            <p>• 支持导入模型、VDK配置和贴图设置</p>
                            <p>• 某些贴图可能需要重新加载</p>
                        </div>
                    </div>
                </div>

                {/* Status Messages */}
                {(exportStatus !== 'idle' || importStatus !== 'idle' || loadingError) && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            {loadingError && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-sm">{loadingError}</span>
                                </div>
                            )}
                            
                            {exportStatus === 'success' && (
                                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="text-sm">{statusMessage}</span>
                                </div>
                            )}
                            
                            {exportStatus === 'error' && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-sm">{statusMessage}</span>
                                </div>
                            )}
                            
                            {importStatus === 'success' && (
                                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="text-sm">{statusMessage}</span>
                                </div>
                            )}
                            
                            {importStatus === 'error' && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-sm">{statusMessage}</span>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Export Format Info */}
                <Separator />
                <div className="space-y-2">
                    <Label className="text-sm font-medium">导出格式说明</Label>
                    <div className="text-sm text-muted-foreground space-y-1">
                        <p><strong>导出内容包括：</strong></p>
                        <ul className="list-disc list-inside ml-2 space-y-1">
                            <li>所有模型的名称、ID、变换属性</li>
                            <li>模型文件路径（完整路径）</li>
                            <li>贴图设置和贴图路径</li>
                            <li>VDK配置数据</li>
                            <li>场景元数据（名称、时间戳等）</li>
                        </ul>
                        <p className="mt-2"><strong>注意：</strong>使用临时文件的模型可能需要重新加载</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
