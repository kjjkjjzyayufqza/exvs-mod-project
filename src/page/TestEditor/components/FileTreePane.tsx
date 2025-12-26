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

  const NodeRow = ({ node, style }: NodeRendererProps<TestTreeNode>) => {
    const Icon = node.isLeaf ? File : node.isOpen ? ChevronDown : ChevronRight;

    const handleClick = () => {
      onSelect(node.data);
      if (!node.isLeaf) {
        node.toggle();
      }
    };

    return (
      <div
        style={style}
        className={`flex items-center gap-2 px-2 py-1 text-sm ${
          node.isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
        }`}
        onClick={handleClick}
        title={node.data.name}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.data.name}</span>
      </div>
    );
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>File list</CardTitle>
          <Button onClick={onPickFolder} disabled={isLoading} size="sm">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            <span className="ml-2">Choose folder</span>
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            className="h-9 pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="h-full min-h-[400px] rounded-lg border bg-card overflow-hidden p-4"
        >
          {empty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Choose a folder to load files
            </div>
          ) : (
            <Tree
              data={data}
              width="100%"
              height={treeHeight}
              indent={16}
              rowHeight={28}
              openByDefault={false}
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