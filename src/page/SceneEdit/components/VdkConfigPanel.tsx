import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { ChevronDown, ChevronUp, Upload, Download, Loader2, Plus } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { VdkObjectInfo, VdkConfig } from '../../../types/vdk';

interface VdkConfigPanelProps {
    vdkConfigs: VdkConfig[];
    vdkObjectInfos: Map<number, VdkObjectInfo>;
    isVdkLoading: boolean;
    vdkLoadingError: string | null;
    onLoadConfig: () => Promise<void>;
    onSaveConfig: () => Promise<void>;
    onAddVdkObject: (objectNumber: number, position: [number, number, number], rotation: [number, number, number]) => void;
}

export function VdkConfigPanel({
    vdkConfigs,
    vdkObjectInfos,
    isVdkLoading,
    vdkLoadingError,
    onLoadConfig,
    onSaveConfig,
    onAddVdkObject
}: VdkConfigPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [newObjectNumber, setNewObjectNumber] = useState('');

    const handleLoadConfig = async () => {
        await onLoadConfig();
    };

    const handleSaveConfig = async () => {
        await onSaveConfig();
    };

    const handleAddVdkObject = () => {
        const objectNumber = parseInt(newObjectNumber, 10);
        if (isNaN(objectNumber) || objectNumber < 0) {
            alert('请输入有效的对象编号');
            return;
        }

        // Check if object number already exists
        if (vdkObjectInfos.has(objectNumber)) {
            alert(`对象编号 ${objectNumber} 已存在`);
            return;
        }

        // Add new VDK object at default position
        onAddVdkObject(objectNumber, [0, 0, 0], [0, 0, 0]);
        setNewObjectNumber('');
    };

    return (
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
            <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                <CardHeader className="p-1 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm text-white">
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

                            <Button
                                onClick={handleSaveConfig}
                                disabled={isVdkLoading || vdkObjectInfos.size === 0}
                                className="w-full text-white hover:bg-white/10 cursor-pointer bg-white/20"
                            >
                                {isVdkLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        保存中...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Download className="h-4 w-4" />
                                        保存VDK配置
                                    </div>
                                )}
                            </Button>
                        </div>

                        {/* Add New VDK Object */}
                        <div className="space-y-2">
                            <Separator className="bg-white/10" />
                            <div className="text-xs text-white/80 font-medium">添加新VDK对象</div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <Label htmlFor="object-number" className="text-xs text-white/60">对象编号</Label>
                                    <Input
                                        id="object-number"
                                        type="number"
                                        value={newObjectNumber}
                                        onChange={(e) => setNewObjectNumber(e.target.value)}
                                        placeholder="输入编号"
                                        className="h-7 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40"
                                    />
                                </div>
                                <Button
                                    onClick={handleAddVdkObject}
                                    disabled={!newObjectNumber.trim()}
                                    size="sm"
                                    className="h-7 px-2 text-white hover:bg-white/10 cursor-pointer bg-white/20"
                                >
                                    <Plus className="h-3 w-3" />
                                </Button>
                            </div>
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
                                    {vdkConfigs.length > 0 ? `${vdkConfigs.length} 个配置 (${vdkObjectInfos.size} 个对象)` : '未加载'}
                                </Badge>
                            </div>

                            <Separator className="bg-white/10" />

                            {/* All VDK Configurations */}
                            <div className="space-y-2">
                                <div className="text-xs text-white/80 font-medium">所有VDK配置:</div>
                                {vdkConfigs.map((config, index) => (
                                    <div key={index} className="space-y-1 p-2 bg-white/5 rounded border border-white/10">
                                        <div className="flex items-center justify-between">
                                            <Badge variant="outline" className={`border-white/30 text-xs ${
                                                config.VDK_TYPE === 'SKY' ? 'text-blue-300 border-blue-300' :
                                                config.VDK_TYPE === 'OBJECT' ? 'text-green-300 border-green-300' :
                                                config.VDK_TYPE === 'EFFECT' ? 'text-yellow-300 border-yellow-300' :
                                                config.VDK_TYPE === 'PROP' ? 'text-purple-300 border-purple-300' :
                                                'text-white'
                                            }`}>
                                                {config.VDK_TYPE}
                                            </Badge>
                                            <span className="text-xs text-white/60">配置 {index + 1}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1 text-xs">
                                            {config.VDK_OBJECTNUMBER !== undefined && (
                                                <div>
                                                    <span className="text-white/60">对象编号:</span>
                                                    <div className="text-white">{config.VDK_OBJECTNUMBER}</div>
                                                </div>
                                            )}
                                            {config.VDK_PROGRAMID !== undefined && (
                                                <div>
                                                    <span className="text-white/60">程序ID:</span>
                                                    <div className="text-white">{config.VDK_PROGRAMID}</div>
                                                </div>
                                            )}
                                            {config.VDK_POSITION_X !== undefined && config.VDK_POSITION_Y !== undefined && config.VDK_POSITION_Z !== undefined && (
                                                <div className="col-span-2">
                                                    <span className="text-white/60">位置:</span>
                                                    <div className="text-white">[{config.VDK_POSITION_X.toFixed(1)}, {config.VDK_POSITION_Y.toFixed(1)}, {config.VDK_POSITION_Z.toFixed(1)}]</div>
                                                </div>
                                            )}
                                            {config.VDK_ROTATION_X !== undefined && config.VDK_ROTATION_Y !== undefined && config.VDK_ROTATION_Z !== undefined && (
                                                <div className="col-span-2">
                                                    <span className="text-white/60">旋转:</span>
                                                    <div className="text-white">[{config.VDK_ROTATION_X.toFixed(1)}, {config.VDK_ROTATION_Y.toFixed(1)}, {config.VDK_ROTATION_Z.toFixed(1)}]</div>
                                                </div>
                                            )}
                                            {config.VDK_SCALE_X !== undefined && config.VDK_SCALE_Y !== undefined && config.VDK_SCALE_Z !== undefined && (
                                                <div className="col-span-2">
                                                    <span className="text-white/60">缩放:</span>
                                                    <div className="text-white">[{config.VDK_SCALE_X.toFixed(1)}, {config.VDK_SCALE_Y.toFixed(1)}, {config.VDK_SCALE_Z.toFixed(1)}]</div>
                                                </div>
                                            )}
                                            {config.VDK_INITIAL_SPAWN !== undefined && (
                                                <div>
                                                    <span className="text-white/60">初始生成:</span>
                                                    <div className="text-white">{config.VDK_INITIAL_SPAWN ? '是' : '否'}</div>
                                                </div>
                                            )}
                                            {config.VDK_SHADOW_CAST !== undefined && (
                                                <div>
                                                    <span className="text-white/60">阴影投射:</span>
                                                    <div className="text-white">{config.VDK_SHADOW_CAST ? '是' : '否'}</div>
                                                </div>
                                            )}
                                            {config.VDK_HITPOINT && (
                                                <div>
                                                    <span className="text-white/60">生命值:</span>
                                                    <div className="text-white">{config.VDK_HITPOINT}</div>
                                                </div>
                                            )}
                                            {config.VDK_PLACEMENT_NAME && (
                                                <div className="col-span-2">
                                                    <span className="text-white/60">放置名称:</span>
                                                    <div className="text-white">"{config.VDK_PLACEMENT_NAME}"</div>
                                                </div>
                                            )}
                                            {config.VDK_EFFECT_ID && (
                                                <div>
                                                    <span className="text-white/60">效果ID:</span>
                                                    <div className="text-white">{config.VDK_EFFECT_ID}</div>
                                                </div>
                                            )}
                                            {config.VDK_EFFECT_TIME_OFFSET !== undefined && (
                                                <div>
                                                    <span className="text-white/60">效果时间偏移:</span>
                                                    <div className="text-white">{config.VDK_EFFECT_TIME_OFFSET}</div>
                                                </div>
                                            )}
                                            {config.VDK_SE_ID && (
                                                <div>
                                                    <span className="text-white/60">音效ID:</span>
                                                    <div className="text-white">{config.VDK_SE_ID}</div>
                                                </div>
                                            )}
                                            {config.VDK_SE_TIME_OFFSET !== undefined && (
                                                <div>
                                                    <span className="text-white/60">音效时间偏移:</span>
                                                    <div className="text-white">{config.VDK_SE_TIME_OFFSET}</div>
                                                </div>
                                            )}
                                            {config.VDK_BREAK_SHOCKWAVE_RADIUS !== undefined && (
                                                <div>
                                                    <span className="text-white/60">冲击波半径:</span>
                                                    <div className="text-orange-300">{config.VDK_BREAK_SHOCKWAVE_RADIUS.toFixed(1)}</div>
                                                </div>
                                            )}
                                            {config.VDK_BREAK_SHOCKWAVE_POWER !== undefined && (
                                                <div>
                                                    <span className="text-white/60">冲击波威力:</span>
                                                    <div className="text-orange-300">{config.VDK_BREAK_SHOCKWAVE_POWER.toFixed(1)}</div>
                                                </div>
                                            )}
                                            {config.VDK_SUBSTITUTE_PLACEMENT !== undefined && (
                                                <div className="col-span-2">
                                                    <span className="text-white/60">替代位置:</span>
                                                    <div className="text-blue-300">
                                                        {Array.isArray(config.VDK_SUBSTITUTE_PLACEMENT)
                                                            ? `[${config.VDK_SUBSTITUTE_PLACEMENT.join(', ')}]`
                                                            : config.VDK_SUBSTITUTE_PLACEMENT}
                                                    </div>
                                                </div>
                                            )}
                                            {config.VDK_CAMERA_BIND_PLACEMENT !== undefined && (
                                                <div className="col-span-2">
                                                    <span className="text-white/60">相机绑定:</span>
                                                    <div className="text-green-300">
                                                        {Array.isArray(config.VDK_CAMERA_BIND_PLACEMENT)
                                                            ? `[${config.VDK_CAMERA_BIND_PLACEMENT.join(', ')}]`
                                                            : config.VDK_CAMERA_BIND_PLACEMENT}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Add more fields as needed */}
                                            {config.VDK_PROP_RELEASE_ATTACH !== undefined && (
                                                <div>
                                                    <span className="text-white/60">释放附件:</span>
                                                    <div className="text-white">{config.VDK_PROP_RELEASE_ATTACH ? '是' : '否'}</div>
                                                </div>
                                            )}
                                            {config.VDK_PROP_LIFE_MAX !== undefined && (
                                                <div>
                                                    <span className="text-white/60">最大生命值:</span>
                                                    <div className="text-white">{config.VDK_PROP_LIFE_MAX}</div>
                                                </div>
                                            )}
                                            {config.VDK_PROP_IMPULSE_EFFECT_SCALE !== undefined && (
                                                <div>
                                                    <span className="text-white/60">脉冲效果缩放:</span>
                                                    <div className="text-white">{config.VDK_PROP_IMPULSE_EFFECT_SCALE.toFixed(1)}</div>
                                                </div>
                                            )}
                                            {config.VDK_PROP_IMPULSE_EFFECT_STRENGTH !== undefined && (
                                                <div>
                                                    <span className="text-white/60">脉冲效果强度:</span>
                                                    <div className="text-white">{config.VDK_PROP_IMPULSE_EFFECT_STRENGTH.toFixed(1)}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <Separator className="bg-white/10" />

                            {/* Object Details */}
                            <div className="text-xs text-white/80 font-medium">对象详情 (按编号分组):</div>

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
