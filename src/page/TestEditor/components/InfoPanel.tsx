import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TestTreeNode } from "../types";

type InfoPanelProps = {
  selected?: TestTreeNode | null;
};

const InfoPanel = ({ selected }: InfoPanelProps) => {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {selected ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="truncate" title={selected.name}>
                {selected.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="uppercase">{selected.isDir ? "Folder" : "File"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Path</span>
              <span className="truncate text-xs" title={selected.path}>
                {selected.path}
              </span>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Select a node to see details</p>
        )}
      </CardContent>
    </Card>
  );
};

export default InfoPanel;

