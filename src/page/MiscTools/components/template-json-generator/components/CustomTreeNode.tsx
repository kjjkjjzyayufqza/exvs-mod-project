import { FileText, Folder, ChevronRight, ChevronDown } from "lucide-react"
import type { NodeApi } from "react-arborist"

interface TreeDataItem {
    id: string
    name: string
    children?: TreeDataItem[]
    data?: {
        type: 'Folder' | 'Item' | 'EndMark'
        index?: number
        fileType?: string
        fileIndex?: number
        fileUrl?: string
        originalFileIndex?: number
        folderCount?: number
        endMarkCount?: number
        unk1?: string
        unk2?: string
        unk3?: number
        unk4?: number
    }
}

// Custom Node component for React Arborist
export function CustomTreeNode({ node, style, dragHandle }: {
    node: NodeApi<TreeDataItem>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void
}) {
    const Icon = node.isLeaf ? FileText : Folder;
    const nodeData = node.data.data;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering selection when clicking toggle
        node.toggle();
    };

    const handleNodeClick = () => {
        node.select();
    };

    return (
        <div
            ref={dragHandle}
            style={style}
            className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer rounded ${node.isSelected ? 'bg-blue-100 text-blue-900' : ''
                } ${node.isFocused ? 'ring-2 ring-blue-500' : ''}`}
            onClick={handleNodeClick}
        >
            {/* Toggle arrow for folders */}
            {!node.isLeaf && (
                <button
                    onClick={handleToggle}
                    className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                    aria-label={node.isOpen ? "Collapse folder" : "Expand folder"}
                >
                    {node.isOpen ? (
                        <ChevronDown className="h-3 w-3 text-gray-500" />
                    ) : (
                        <ChevronRight className="h-3 w-3 text-gray-500" />
                    )}
                </button>
            )}

            {/* Spacer for leaf nodes to align with folder content */}
            {node.isLeaf && <div className="w-4 flex-shrink-0" />}

            <Icon
                className={`h-4 w-4 ${node.isLeaf ? 'text-gray-600' : 'text-blue-600'} flex-shrink-0`}
            />
            <span className="text-sm select-none flex-1 min-w-0">
                {node.isEditing ? (
                    <input
                        type="text"
                        defaultValue={node.data.name}
                        onBlur={(e) => node.submit(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                node.submit(e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                                node.reset();
                            }
                        }}
                        className="px-1 py-0 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                        autoFocus
                    />
                ) : (
                    <span className="truncate">{node.data.name}</span>
                )}
            </span>
            <div className="text-xs text-gray-500 ml-auto flex-shrink-0 flex gap-2">
                {nodeData?.type && (
                    <span className="bg-gray-200 px-1 rounded">
                        {nodeData.type}
                    </span>
                )}
                {nodeData?.fileType && (
                    <span className="bg-blue-100 px-1 rounded">
                        {nodeData.fileType}
                    </span>
                )}
                {nodeData?.unk1 && (
                    <span className="bg-yellow-100 px-1 rounded">
                        unk1:{nodeData.unk1}
                    </span>
                )}
                {nodeData?.unk2 && (
                    <span className="bg-green-100 px-1 rounded">
                        unk2:{nodeData.unk2}
                    </span>
                )}
                {nodeData?.unk3 !== undefined && (
                    <span className="bg-purple-100 px-1 rounded">
                        unk3:{nodeData.unk3}
                    </span>
                )}
                {nodeData?.unk4 !== undefined && (
                    <span className="bg-pink-100 px-1 rounded">
                        unk4:{nodeData.unk4}
                    </span>
                )}
                {nodeData?.fileIndex !== undefined && (
                    <span className="bg-red-100 px-1 rounded">
                        idx:{nodeData.fileIndex}
                    </span>
                )}
                {nodeData?.folderCount !== undefined && (
                    <span className="bg-indigo-100 px-1 rounded">
                        count:{nodeData.folderCount}
                    </span>
                )}
                {nodeData?.endMarkCount !== undefined && (
                    <span className="bg-orange-100 px-1 rounded">
                        endMark:{nodeData.endMarkCount}
                    </span>
                )}
            </div>
        </div>
    );
}
