import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Upload } from 'lucide-react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { open } from '@tauri-apps/plugin-dialog';
import { useSceneStore } from '../../../store/sceneStore';
import { toast } from 'sonner';
import { useState } from 'react';

export function ImportPanel() {
    const { loadSpecificDAEModel, loadHavokModelFromFile, isLoading, loadingError } = useSceneStore();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleImportModels = async () => {
        try {
            // Open file dialog to select multiple DAE files
            const selectedFiles = await open({
                multiple: true,
                filters: [{
                    name: 'DAE Files',
                    extensions: ['dae']
                }]
            });

            if (!selectedFiles || (Array.isArray(selectedFiles) && selectedFiles.length === 0)) {
                return;
            }

            // Handle both single file (string) and multiple files (string[])
            const filePaths = Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles];

            toast.info(`开始导入 ${filePaths.length} 个模型文件...`);

            // Load each DAE model
            for (const filePath of filePaths) {
                try {
                    await loadSpecificDAEModel(filePath);
                    toast.success(`成功导入: ${filePath.split(/[/\\]/).pop()}`);
                } catch (error) {
                    console.error(`Failed to load DAE model ${filePath}:`, error);
                    toast.error(`导入失败: ${filePath.split(/[/\\]/).pop()}`);
                }
            }

            toast.success(`完成导入 ${filePaths.length} 个模型文件`);
        } catch (error) {
            console.error('Error importing models:', error);
            toast.error('导入模型时发生错误');
        }
    };

    const handleImportHavokModel = async () => {
        try {
            await loadHavokModelFromFile();
            toast.success('Havok模型导入成功');
        } catch (error) {
            console.error('Error importing Havok model:', error);
            toast.error('导入Havok模型时发生错误');
        }
    };

    return (
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
            <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                <CardHeader className="p-1 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm text-white">
                            模型导入
                        </CardTitle>
                        <CollapsibleTrigger asChild>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                            >
                                {isCollapsed ? <ChevronDown className="h-3 w-3 transition-transform duration-200" /> : <ChevronUp className="h-3 w-3 transition-transform duration-200" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="p-1">
                        <div className="space-y-3">
                            {loadingError && (
                                <div className="p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-300">
                                    {loadingError}
                                </div>
                            )}

                            <Button
                                onClick={handleImportModels}
                                disabled={isLoading}
                                className="w-full text-white hover:bg-white/10  cursor-pointer bg-white/20"
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        导入中...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Upload className="h-4 w-4" />
                                        选择模型文件
                                    </div>
                                )}
                            </Button>

                            <Button
                                onClick={handleImportHavokModel}
                                disabled={isLoading}
                                className="w-full text-white hover:bg-purple-500/20 cursor-pointer bg-purple-500/30"
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        导入中...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Upload className="h-4 w-4" />
                                        导入Havok XML
                                    </div>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
