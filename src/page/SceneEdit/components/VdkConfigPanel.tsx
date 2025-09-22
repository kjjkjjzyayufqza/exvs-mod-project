import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { VdkObjectInfo } from '../../../types/vdk';

interface VdkConfigPanelProps {
    vdkObjectInfos: Map<number, VdkObjectInfo>;
    isVdkLoading: boolean;
    vdkLoadingError: string | null;
    onLoadConfig: () => Promise<void>;
    onApplyConfig: () => Promise<void>;
}

export function VdkConfigPanel({
    vdkObjectInfos,
    isVdkLoading,
    vdkLoadingError,
    onLoadConfig,
    onApplyConfig
}: VdkConfigPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    const handleLoadConfig = async () => {
        await onLoadConfig();
    };

    const handleApplyConfig = async () => {
        setIsApplying(true);
        try {
            await onApplyConfig();
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
            <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                <CardHeader className="p-1 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm text-white flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            VDK配置
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
                    <CardContent className="p-1 space-y-3">
                        {/* Action Buttons */}
                        <div className="space-y-2">
                            <Button
                                onClick={handleLoadConfig}
                                disabled={isVdkLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
                                size="sm"
                            >
                                {isVdkLoading ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        加载中...
                                    </>
                                ) : (
                                    '加载VDK配置'
                                )}
                            </Button>

                            <Button
                                onClick={handleApplyConfig}
                                disabled={isVdkLoading || vdkObjectInfos.size === 0 || isApplying}
                                className="w-full bg-green-600 hover:bg-green-700 text-white text-xs"
                                size="sm"
                            >
                                {isApplying ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        应用中...
                                    </>
                                ) : (
                                    '应用到场景'
                                )}
                            </Button>
                        </div>

                        {/* Error Display */}
                        {vdkLoadingError && (
                            <div className="p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-300">
                                {vdkLoadingError}
                            </div>
                        )}

                        {/* Config Status */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-white/80">
                                <span>配置状态:</span>
                                <Badge variant="secondary" className="bg-white/10 text-white border-white/20 text-xs">
                                    {vdkObjectInfos.size > 0 ? `${vdkObjectInfos.size} 个对象` : '未加载'}
                                </Badge>
                            </div>

                            <Separator className="bg-white/10" />

                            {/* Object List */}
                            {Array.from(vdkObjectInfos.entries()).map(([objectNumber, objectInfo]) => (
                                <div key={objectNumber} className="space-y-2 p-2 bg-white/5 rounded border border-white/10">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/80">对象编号:</span>
                                        <Badge variant="outline" className="border-white/30 text-white text-xs">
                                            {objectNumber}
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                        <div>
                                            <span className="text-white/60">程序ID:</span>
                                            <div className="text-white">{objectInfo.programId}</div>
                                        </div>
                                        <div>
                                            <span className="text-white/60">生命值:</span>
                                            <div className="text-white">{objectInfo.hitPoint}</div>
                                        </div>
                                        <div>
                                            <span className="text-white/60">阴影投射:</span>
                                            <div className="text-white">{objectInfo.shadowCast ? '是' : '否'}</div>
                                        </div>
                                        <div>
                                            <span className="text-white/60">实例数量:</span>
                                            <div className="text-white">{objectInfo.count}</div>
                                        </div>
                                    </div>

                                    {/* Show all positions and rotations */}
                                    <div className="space-y-1">
                                        <div className="text-xs text-white/60 font-medium">实例位置:</div>
                                        {objectInfo.positions.map((position, index) => (
                                            <div key={index} className="text-xs text-white/70 pl-2 border-l border-white/20">
                                                <div>实例 {index}: 位置 [{position.map(v => v.toFixed(1)).join(', ')}]</div>
                                                <div className="pl-4">旋转 [{objectInfo.rotations[index].map(v => v.toFixed(1)).join(', ')}]</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
