import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi, type NodeRendererProps } from "react-arborist";
import { Search, FolderOpen, Loader2, ChevronRight, ChevronDown, Folder, File } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TestTreeNode } from "../types";

type FileTreePaneProps = {
  data: TestTreeNode[];
  onSelect: (node: TestTreeNode | null) => void;
  selectedId?: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onPickFolder: () => void;
  isLoading?: boolean;
  currentDir?: string;
  currentJsonPath?: string | null;
  hasUnsavedChanges?: boolean;
};

export function FileTreePane({
  data,
  onSelect,
  selectedId,
  searchTerm,
  onSearchChange,
  onPickFolder,
  isLoading = false,
  currentDir,
  currentJsonPath,
  hasUnsavedChanges = false,
}: FileTreePaneProps) {
  const empty = data.length === 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateHeight = () => setTreeHeight(el.clientHeight || 480);
    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const selection = useMemo(() => selectedId ?? undefined, [selectedId]);

  // Check if a node is in the path to the current JSON file
  const isInJsonPath = useMemo(() => {
    if (!currentJsonPath) return new Set<string>();
    
    const pathSet = new Set<string>();
    
    // Function to find the JSON node and mark all ancestors
    const findAndMarkPath = (nodes: TestTreeNode[], targetPath: string, ancestors: string[] = []): boolean => {
      for (const node of nodes) {
        const currentAncestors = [...ancestors, node.path];
        
        // If this is the target JSON file, mark all ancestors
        if (node.path === targetPath) {
          ancestors.forEach(path => pathSet.add(path));
          pathSet.add(node.path);
          return true;
        }
        
        // If this is a directory, search its children
        if (node.isDir && node.children) {
          if (findAndMarkPath(node.children, targetPath, currentAncestors)) {
            return true;
          }
        }
      }
      return false;
    };
    
    findAndMarkPath(data, currentJsonPath);
    return pathSet;
  }, [currentJsonPath, data]);

  const NodeRow = ({ node, style }: NodeRendererProps<TestTreeNode>) => {
    const isDir = node.data.isDir;
    const Icon = isDir ? (node.isOpen ? ChevronDown : ChevronRight) : File;
    
    // Check if this is the current JSON file being edited
    const isCurrentJson = !isDir && 
                          node.data.name.toLowerCase().endsWith('.json') && 
                          currentJsonPath === node.data.path;
    
    // Check if this node is in the path to the current JSON file
    const isInPath = isInJsonPath.has(node.data.path);

    const handleClick = () => {
      onSelect(node.data);
      if (isDir) {
        node.toggle();
      }
    };

    // Determine background color based on state
    let bgClass = "hover:bg-muted";
    if (node.isSelected) {
      bgClass = "bg-primary/10 text-primary";
    } else if (isInPath) {
      // Yellow highlight for nodes in the path to current JSON file
      bgClass = hasUnsavedChanges 
        ? "bg-yellow-200/80 dark:bg-yellow-900/40 hover:bg-yellow-200 dark:hover:bg-yellow-900/50" 
        : "bg-yellow-100/60 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30";
    }

    return (
      <div
        style={style}
        className={`flex items-center gap-1 px-1.5 py-0.5 ${bgClass}`}
        onClick={handleClick}
        title={node.data.name}
      >
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.data.name}</span>
      </div>
    );
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-0 p-3 pb-1">
        <div className="flex items-center justify-between gap-1.5">
          <CardTitle className="text-sm">File list</CardTitle>
          <Button onClick={onPickFolder} disabled={isLoading} size="sm" className="h-7 px-2">
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />}
            <span className="ml-1.5">Choose folder</span>
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-2 pt-1">
        <div
          ref={containerRef}
          className="h-full min-h-[400px] rounded-lg border bg-card overflow-hidden p-2"
        >
          {empty ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Choose a folder to load files
            </div>
          ) : (
            <Tree
              data={data}
              width="100%"
              height={treeHeight}
              indent={20}
              rowHeight={24}
              openByDefault={false}
              // Ensure directories remain internal nodes even when children are temporarily filtered out.
              childrenAccessor={(node) => (node.isDir ? node.children ?? [] : node.children ?? null)}
              selection={selection}
              onSelect={(nodes: NodeApi<TestTreeNode>[]) => onSelect(nodes[0]?.data ?? null)}
            >
              {(props) => <NodeRow {...props} />}
            </Tree>
          )}
        </div>
      </CardContent>
    </Card>
  );
}