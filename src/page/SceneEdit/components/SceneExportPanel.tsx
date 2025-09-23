import React, { useState } from 'react';
import { useSceneStore } from '../../../store/sceneStore';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Download, Upload, FileText } from 'lucide-react';

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

    const modelCount = Object.keys(models).length;

    const handleExport = async () => {
        try {
            const exportName = sceneName.trim() || `Scene_${new Date().toISOString().slice(0, 10)}`;
            await exportScene(exportName);
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    const handleImport = async () => {
        try {
            await importScene();
        } catch (error) {
            console.error('Import failed:', error);
        }
    };

    return (
        <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
            <CardHeader className="p-1 border-b border-white/10">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    场景导出/导入
                </CardTitle>
            </CardHeader>
            <CardContent className="p-1">
                <div className="space-y-2">
                    <Input
                        placeholder="场景名称..."
                        value={sceneName}
                        onChange={(e) => setSceneName(e.target.value)}
                        disabled={isLoading}
                        className="text-xs bg-white/10 border-white/20 text-white placeholder:text-white/60"
                    />
                    <Button
                        onClick={handleExport}
                        disabled={isLoading || modelCount === 0}
                        className="w-full text-white hover:bg-white/10 cursor-pointer bg-white/20"
                    >
                        <Download className="h-4 w-4 mr-2" />
                        {isLoading ? '导出中...' : '导出场景'}
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={isLoading}
                        className="w-full text-white hover:bg-white/10 cursor-pointer bg-white/20"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        {isLoading ? '导入中...' : '导入场景'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
