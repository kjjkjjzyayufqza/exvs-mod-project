import React, { useEffect, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  ExternalLink, 
  Download, 
  MoreHorizontal, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AssetRefInfo } from "./assetRef";
import { extractAsset } from "./extractFhm2d";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface CharacterAssetFieldProps {
  asset: AssetRefInfo;
  extractOutputPath: string;
  onReveal?: (path: string) => void;
}

export const CharacterAssetField: React.FC<CharacterAssetFieldProps> = ({
  asset,
  extractOutputPath,
  onReveal,
}) => {
  const [sourceExists, setSourceExists] = useState<boolean | null>(null);
  const [workspaceExists, setWorkspaceExists] = useState<boolean | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    const checkExists = async () => {
      if (asset.sourceFilePath) {
        setSourceExists(await exists(asset.sourceFilePath));
      } else {
        setSourceExists(false);
      }

      if (asset.workspaceFolderPath) {
        setWorkspaceExists(await exists(asset.workspaceFolderPath));
      } else {
        setWorkspaceExists(false);
      }
    };
    checkExists();
  }, [asset.sourceFilePath, asset.workspaceFolderPath]);

  const handleExtract = async () => {
    setIsExtracting(true);
    const result = await extractAsset(asset, extractOutputPath);
    setIsExtracting(false);

    if (result.success) {
      toast.success(`Extracted ${asset.fieldKey} to output folder`, {
        action: {
          label: "Open Folder",
          onClick: () => openPath(result.path!),
        },
      });
      setWorkspaceExists(true);
    } else {
      toast.error(result.error || "Extraction failed");
    }
  };

  const handleOpenSourceFolder = async () => {
    if (!asset.sourceFilePath) return;
    try {
      const folderPath = await dirname(asset.sourceFilePath);
      await openPath(folderPath);
    } catch (err) {
      console.error("Failed to open source folder:", err);
      toast.error("Failed to open source folder");
    }
  };

  const handleCopyPath = async (path: string) => {
    await writeText(path);
    toast.success("Path copied to clipboard");
  };

  const isZero = asset.rawValue === 0;

  if (isZero) {
    return <span className="text-muted-foreground italic text-xs">None (0)</span>;
  }

  return (
    <div className="flex items-center gap-1 ml-auto">
      {/* Status Icons */}
      <div className="flex items-center gap-0.5 mr-1">
        <StatusIcon 
          exists={sourceExists} 
          label="OB" 
          tooltip={sourceExists ? "Source .fhm2d exists. Click to open folder." : "Source .fhm2d missing"} 
          onClick={sourceExists ? handleOpenSourceFolder : undefined}
        />
        <StatusIcon 
          exists={workspaceExists} 
          label="WS" 
          tooltip={workspaceExists ? "Extracted folder exists in workspace. Click to reveal in File Tree." : "Not extracted in workspace"} 
          onClick={workspaceExists ? () => onReveal?.(asset.workspaceFolderPath) : undefined}
        />
      </div>

      {/* More Actions */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-sm mb-1">{asset.fieldKey} Asset</h4>
              <p className="text-xs text-muted-foreground font-mono break-all bg-muted p-1.5 rounded">
                {asset.hashHex} ({asset.rawValue})
              </p>
            </div>

            <div className="grid gap-2 overflow-hidden">
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Source (OB)</span>
                <div className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-xs truncate flex-1 bg-muted/30 p-1 rounded" title={asset.sourceFilePath}>
                    {asset.sourceFilePath || "Not configured"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleCopyPath(asset.sourceFilePath)} disabled={!asset.sourceFilePath}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Workspace (WS)</span>
                <div className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-xs truncate flex-1 bg-muted/30 p-1 rounded" title={asset.workspaceFolderPath}>
                    {asset.workspaceFolderPath || "Not configured"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleCopyPath(asset.workspaceFolderPath)} disabled={!asset.workspaceFolderPath}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button 
                size="sm" 
                className="w-full justify-start gap-2" 
                onClick={handleExtract}
                disabled={isExtracting || !sourceExists}
              >
                <Download className="h-3.5 w-3.5" />
                {isExtracting ? "Extracting..." : "Extract to Output Folder"}
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start gap-2"
                onClick={() => openPath(asset.workspaceFolderPath)}
                disabled={!workspaceExists}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Extracted Folder
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

const StatusIcon = ({ exists, label, tooltip, onClick }: { exists: boolean | null, label: string, tooltip: string, onClick?: () => void }) => {
  if (exists === null) return <div className="w-3 h-3 animate-pulse bg-muted rounded-full" />;
  
  return (
    <div 
      className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted/50 border text-[9px] font-bold transition-colors",
        onClick && "cursor-pointer hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
      )}
      title={tooltip}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{label}</span>
      {exists ? (
        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
      ) : (
        <XCircle className="h-2.5 w-2.5 text-destructive" />
      )}
    </div>
  );
};
