import { Folder, FileText, ChevronRight, ChevronDown } from "lucide-react"
import type { NodeApi } from "react-arborist"
import type { TreeDataItem } from "@/lib/utils"

interface CustomTreeNodeProps {
  node: NodeApi<TreeDataItem>;
  style: React.CSSProperties;
  dragHandle?: (el: HTMLDivElement | null) => void;
  enableExampleHighlight?: boolean;
}

export function CustomTreeNode({
  node,
  style,
  dragHandle,
  enableExampleHighlight = false
}: CustomTreeNodeProps) {
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
          <span className={`truncate ${enableExampleHighlight && nodeData?.isExample ? 'text-red-600 font-medium' : ''}`}>
            {node.data.name}
          </span>
        )}
      </span>
      {nodeData?.type === 'Item' && nodeData.fileType && (
        <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
          {nodeData.fileType}
        </span>
      )}
    </div>
  );
}
