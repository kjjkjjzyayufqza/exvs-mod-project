import { Folder, FileText, ChevronRight, ChevronDown, AlertTriangle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { NodeApi } from "react-arborist"
import type { TreeDataItem } from "@/lib/utils"

interface CustomTreeNodeProps {
  node: NodeApi<TreeDataItem>;
  style: React.CSSProperties;
  dragHandle?: (el: HTMLDivElement | null) => void;
  enableExampleHighlight?: boolean;
  mode?: string;
}

export function CustomTreeNode({
  node,
  style,
  dragHandle,
  enableExampleHighlight = false,
  mode = 'Model'
}: CustomTreeNodeProps) {
  const Icon = node.isLeaf ? FileText : Folder;
  const nodeData = node.data.data;

  // Check if this is a Texture Folder and needs warning
  const showBarispecularWarning = mode === 'Model' &&
    nodeData?.type === 'Folder' &&
    node.data.name?.includes('Textures Folder') &&
    !hasBarispecularFile(node);

  // Helper function to check if Texture Folder contains barispecular file
  function hasBarispecularFile(folderNode: NodeApi<TreeDataItem>): boolean {
    if (!folderNode.children) return false;

    return folderNode.children.some(child => {
      const childData = child.data.data;
      if (childData?.type === 'Item' && childData.fileType === '.nutexb') {
        // Check if filename matches barispecular pattern
        return /barispecular/i.test(child.data.name);
      }
      return false;
    });
  }

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
      style={{
        ...style,
        outline: node.isSelected || node.isFocused ? '2px solid rgb(59 130 246)' : 'none',
        outlineOffset: '-2px',
      }}
      className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer rounded ${node.isSelected ? 'bg-blue-100 text-blue-900' : ''}`}
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

      {/* Barispecular warning for Texture Folders in Model mode */}
      {showBarispecularWarning && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-4 w-4 text-yellow-500 ml-2 flex-shrink-0 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Missing barispecular texture file</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
