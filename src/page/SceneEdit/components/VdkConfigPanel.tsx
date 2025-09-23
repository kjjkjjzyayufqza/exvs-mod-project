import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { ChevronDown, ChevronUp, FileText, Upload, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { VdkObjectInfo } from '../../../types/vdk';

interface VdkConfigPanelProps {
    vdkObjectInfos: Map<number, VdkObjectInfo>;
    isVdkLoading: boolean;
    vdkLoadingError: string | null;
    onLoadConfig: () => Promise<void>;
}

export function VdkConfigPanel({
    vdkObjectInfos,
    isVdkLoading,
    vdkLoadingError,
    onLoadConfig
}: VdkConfigPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLoadConfig = async () => {
        await onLoadConfig();
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
                        {/* Action Button */}
                        <Button
                            onClick={handleLoadConfig}
                            disabled={isVdkLoading}
                            className="w-full text-white hover:bg-white/10 cursor-pointer bg-white/20"
                        >
                            {isVdkLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    加载中...
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Upload className="h-4 w-4" />
                                    加载VDK配置
                                </div>
                            )}
                        </Button>

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
                                        <div className="text-xs text-white/60 font-medium">实例详情:</div>
                                        {objectInfo.positions.map((position, index) => (
                                            <div key={index} className="text-xs text-white/70 pl-2 border-l border-white/20">
                                                <div>实例 {index}: 位置 [{position.map(v => v.toFixed(1)).join(', ')}]</div>
                                                <div className="pl-4">旋转 [{objectInfo.rotations[index].map(v => v.toFixed(1)).join(', ')}]</div>
                                                {/* Show shockwave properties if they exist */}
                                                {(objectInfo.breakShockwaveRadius[index] > 0 || objectInfo.breakShockwavePower[index] > 0) && (
                                                    <div className="pl-4 text-orange-300">
                                                        冲击波: 半径 {objectInfo.breakShockwaveRadius[index]?.toFixed(1) || 0}, 
                                                        威力 {objectInfo.breakShockwavePower[index]?.toFixed(1) || 0}
                                                    </div>
                                                )}
                                                {/* Show substitute placements if they exist */}
                                                {objectInfo.substitutePlacements[index] && Array.isArray(objectInfo.substitutePlacements[index]) && (objectInfo.substitutePlacements[index] as number[]).length > 0 && (
                                                    <div className="pl-4 text-blue-300">
                                                        替代位置: [{(objectInfo.substitutePlacements[index] as number[]).join(', ')}]
                                                    </div>
                                                )}
                                                {objectInfo.substitutePlacements[index] && typeof objectInfo.substitutePlacements[index] === 'number' && (
                                                    <div className="pl-4 text-blue-300">
                                                        替代位置: {objectInfo.substitutePlacements[index] as number}
                                                    </div>
                                                )}
                                                {/* Show camera bind placements if they exist */}
                                                {objectInfo.cameraBindPlacements[index] && Array.isArray(objectInfo.cameraBindPlacements[index]) && (objectInfo.cameraBindPlacements[index] as number[]).length > 0 && (
                                                    <div className="pl-4 text-green-300">
                                                        相机绑定: [{(objectInfo.cameraBindPlacements[index] as number[]).join(', ')}]
                                                    </div>
                                                )}
                                                {objectInfo.cameraBindPlacements[index] && typeof objectInfo.cameraBindPlacements[index] === 'number' && (
                                                    <div className="pl-4 text-green-300">
                                                        相机绑定: {objectInfo.cameraBindPlacements[index] as number}
                                                    </div>
                                                )}
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
