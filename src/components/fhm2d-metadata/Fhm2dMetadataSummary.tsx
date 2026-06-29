import { FileJson, FolderOpen, Hash, Info, PackageCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Fhm2dMetadataSummaryProps = {
  name: string;
  hashName?: string | null;
  folderPath?: string | null;
  structureJsonPath?: string | null;
  repackOutputPath?: string | null;
  className?: string;
  compact?: boolean;
};

function MetadataRow({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:items-start">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "min-w-0 break-all rounded-md border bg-background/70 px-2 py-1.5 font-mono text-xs",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Fhm2dMetadataSummary({
  name,
  hashName,
  folderPath,
  structureJsonPath,
  repackOutputPath,
  className,
  compact = false,
}: Fhm2dMetadataSummaryProps) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-muted/20 text-sm shadow-sm shadow-background/20",
        compact ? "space-y-2 p-3" : "space-y-3 p-4",
        className,
      )}
      aria-label="FHM2D metadata preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Info className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Structure metadata</div>
            <p className="text-xs text-muted-foreground">
              Name controls the editable folder. HashName controls the game file.
            </p>
          </div>
        </div>
        <Badge
          variant={hashName ? "secondary" : "destructive"}
          className={cn(
            "rounded-md font-mono",
            hashName ? "bg-primary/10 text-primary hover:bg-primary/10" : undefined,
          )}
        >
          <Hash className="h-3 w-3" />
          {hashName ?? "HashName missing"}
        </Badge>
      </div>

      <div className="space-y-2">
        <MetadataRow
          icon={<FolderOpen className="h-3.5 w-3.5" />}
          label="Name"
          value={name || "fhm2d_pack"}
        />
        {folderPath ? (
          <MetadataRow
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            label="Folder"
            value={folderPath}
          />
        ) : null}
        {structureJsonPath ? (
          <MetadataRow
            icon={<FileJson className="h-3.5 w-3.5" />}
            label="Structure JSON"
            value={structureJsonPath}
          />
        ) : null}
        {repackOutputPath ? (
          <MetadataRow
            icon={<PackageCheck className="h-3.5 w-3.5" />}
            label="Repack output"
            value={repackOutputPath}
          />
        ) : null}
      </div>
    </section>
  );
}
